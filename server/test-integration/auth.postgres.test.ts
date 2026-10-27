import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import type { AuthConfig } from '../src/auth/config.js'
import { AuthRateLimiter } from '../src/auth/rate-limiter.js'
import type { EmailSender } from '../src/auth/types.js'
import { AppError } from '../src/errors/app-error.js'
import { disconnectPrismaClient, getPrismaClient } from '../src/lib/prisma.js'

const password = 'SenhaSegura123'
const newPassword = 'NovaSenhaSegura456'
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const prefix = `auth-${suffix}`
let clockOffsetMs = 0
const confirmations = new Map<string, string>()
const resets = new Map<string, string>()
const database = getPrismaClient()

const config: AuthConfig = {
  appBaseUrl: 'http://localhost:5173',
  csrfSecret: 'integration-test-secret-with-at-least-32-characters',
  cookieName: 'indica_test_session',
  secureCookies: false,
  sessionIdleMs: 30 * 60 * 1000,
  sessionAbsoluteMs: 7 * 24 * 60 * 60 * 1000,
  confirmationTokenMs: 24 * 60 * 60 * 1000,
  passwordResetTokenMs: 60 * 60 * 1000,
  resendCooldownMs: 60 * 1000,
}

const emailSender: EmailSender = {
  async sendEmailConfirmation(message) { confirmations.set(message.to, tokenFrom(message.confirmationUrl)) },
  async sendPasswordReset(message) { resets.set(message.to, tokenFrom(message.resetUrl)) },
}

let app: ReturnType<typeof createApp>

describe('autenticação com PostgreSQL exclusivo', () => {
  beforeAll(() => requireSafeDatabaseTestConfiguration())
  beforeEach(() => {
    clockOffsetMs = 0
    app = createApp({
      databaseProvider: () => database,
      authOptions: {
        configProvider: () => config,
        emailSenderProvider: () => emailSender,
        now: () => new Date(Date.now() + clockOffsetMs),
        rateLimiter: new AuthRateLimiter(config.csrfSecret, () => Date.now() + clockOffsetMs),
      },
    })
  })
  afterAll(async () => {
    await database.user.deleteMany({ where: { email: { contains: prefix } } })
    await disconnectPrismaClient()
  })

  it('1. cria cadastro válido com e-mail normalizado e hash', async () => {
    const email = address('valid')
    const response = await request(app).post('/api/auth/register').send(registration(email.toUpperCase()))
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(response.body.data).toMatchObject({ email, status: 'PENDING', role: 'USER' })
    expect(response.body.data).not.toHaveProperty('passwordHash')
    const stored = await database.user.findUniqueOrThrow({ where: { email } })
    expect(stored.passwordHash).not.toBe(password)
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true)
  })

  it('2. valida campos, confirmação e requisitos de senha', async () => {
    const response = await request(app).post('/api/auth/register').send({ name: 'A', email: 'inválido', password: '123', passwordConfirmation: '456' })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details.length).toBeGreaterThanOrEqual(3)
  })

  it('3. impede e-mails duplicados independentemente de caixa', async () => {
    const email = address('duplicate')
    await register(email)
    const response = await request(app).post('/api/auth/register').send(registration(email.toUpperCase()))
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  it('4. mantém a conta pendente antes da confirmação', async () => {
    const email = address('pending')
    await register(email)
    const stored = await database.user.findUniqueOrThrow({ where: { email } })
    expect(stored.status).toBe('PENDING')
    expect(stored.emailConfirmedAt).toBeNull()
  })

  it('5. confirma a conta com token válido de uso único', async () => {
    const email = address('confirm')
    const token = await register(email)
    const response = await request(app).post('/api/auth/confirm-email').send({ token })
    expect(response.status).toBe(200)
    expect(await database.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ status: 'ACTIVE', role: 'USER' })
  })

  it('6. rejeita token de confirmação inválido, expirado ou reutilizado', async () => {
    expect((await request(app).post('/api/auth/confirm-email').send({ token: 'x'.repeat(43) })).body.error.code).toBe('AUTH_TOKEN_INVALID')
    const expiredEmail = address('expired-confirm')
    const expiredToken = await register(expiredEmail)
    clockOffsetMs += config.confirmationTokenMs + 1
    expect((await request(app).post('/api/auth/confirm-email').send({ token: expiredToken })).body.error.code).toBe('AUTH_TOKEN_EXPIRED')
    clockOffsetMs = 0
    const reusedToken = await register(address('reused-confirm'))
    expect((await request(app).post('/api/auth/confirm-email').send({ token: reusedToken })).status).toBe(200)
    expect((await request(app).post('/api/auth/confirm-email').send({ token: reusedToken })).body.error.code).toBe('AUTH_TOKEN_USED')
  })

  it('7. reenvia confirmação com cooldown e invalida token anterior', async () => {
    const email = address('resend')
    const first = await register(email)
    expect((await request(app).post('/api/auth/resend-confirmation').send({ email })).status).toBe(429)
    clockOffsetMs += config.resendCooldownMs + 1
    expect((await request(app).post('/api/auth/resend-confirmation').send({ email })).status).toBe(202)
    const second = confirmations.get(email)!
    expect(second).not.toBe(first)
    expect((await request(app).post('/api/auth/confirm-email').send({ token: first })).body.error.code).toBe('AUTH_TOKEN_USED')
    expect((await request(app).post('/api/auth/confirm-email').send({ token: second })).status).toBe(200)
  })

  it('8. bloqueia login antes da confirmação', async () => {
    const email = address('pending-login')
    await register(email)
    const response = await request(app).post('/api/auth/login').send({ email, password })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('EMAIL_CONFIRMATION_REQUIRED')
  })

  it('9. permite login válido após confirmação sem expor segredo', async () => {
    const email = address('login')
    await activate(email)
    const response = await request(app).post('/api/auth/login').send({ email, password })
    expect(response.status).toBe(200)
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly')
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Strict')
    expect(response.body.data.user).not.toHaveProperty('passwordHash')
    expect(response.body.data.csrfToken).toBeTypeOf('string')
  })

  it('10. rejeita credenciais incorretas com resposta uniforme', async () => {
    const email = address('wrong')
    await activate(email)
    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'SenhaIncorreta123' })
    const missing = await request(app).post('/api/auth/login').send({ email: address('missing'), password: 'SenhaIncorreta123' })
    expect(wrong.status).toBe(401)
    expect(missing.status).toBe(401)
    expect(wrong.body.error).toEqual(missing.body.error)
  })

  it('11. persiste, expira e encerra a sessão', async () => {
    const email = address('session')
    await activate(email)
    const agent = request.agent(app)
    const login = await agent.post('/api/auth/login').send({ email, password })
    const csrf = login.body.data.csrfToken
    expect((await agent.get('/api/auth/session')).status).toBe(200)
    const user = await database.user.findUniqueOrThrow({ where: { email } })
    const session = await database.userSession.findFirstOrThrow({ where: { userId: user.id, revokedAt: null } })
    const expiredAt = new Date(Date.now() - 1_000)
    await database.userSession.update({
      where: { id: session.id },
      data: { createdAt: new Date(Date.now() - 2_000), lastSeenAt: new Date(Date.now() - 2_000), expiresAt: expiredAt },
    })
    expect((await agent.get('/api/auth/session')).status).toBe(401)

    const secondAgent = request.agent(app)
    const secondLogin = await secondAgent.post('/api/auth/login').send({ email, password })
    expect((await secondAgent.post('/api/auth/logout').set('x-csrf-token', secondLogin.body.data.csrfToken ?? csrf)).status).toBe(204)
    expect((await secondAgent.get('/api/auth/session')).status).toBe(401)
  })

  it('12. bloqueia rotas protegidas sem autenticação', async () => {
    const response = await request(app).get('/api/registrations/environments')
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('13. recupera e redefine senha sem revelar existência da conta', async () => {
    const email = address('reset')
    await activate(email)
    const existing = await request(app).post('/api/auth/forgot-password').send({ email })
    const missing = await request(app).post('/api/auth/forgot-password').send({ email: address('reset-missing') })
    expect(existing.status).toBe(202)
    expect(existing.body).toEqual(missing.body)
    const token = resets.get(email)!
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: newPassword, passwordConfirmation: newPassword })).status).toBe(200)
    expect((await request(app).post('/api/auth/login').send({ email, password })).status).toBe(401)
    expect((await request(app).post('/api/auth/login').send({ email, password: newPassword })).status).toBe(200)
  })

  it('14. rejeita token de recuperação expirado ou reutilizado e invalida sessões antigas', async () => {
    const email = address('reset-token')
    await activate(email)
    const agent = request.agent(app)
    expect((await agent.post('/api/auth/login').send({ email, password })).status).toBe(200)
    await request(app).post('/api/auth/forgot-password').send({ email })
    const token = resets.get(email)!
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: newPassword, passwordConfirmation: newPassword })).status).toBe(200)
    expect((await request(app).post('/api/auth/reset-password').send({ token, password, passwordConfirmation: password })).body.error.code).toBe('AUTH_TOKEN_USED')
    expect((await agent.get('/api/auth/session')).status).toBe(401)

    const expiredEmail = address('expired-reset')
    await activate(expiredEmail)
    await request(app).post('/api/auth/forgot-password').send({ email: expiredEmail })
    const expiredToken = resets.get(expiredEmail)!
    clockOffsetMs += config.passwordResetTokenMs + 1
    expect((await request(app).post('/api/auth/reset-password').send({ token: expiredToken, password: newPassword, passwordConfirmation: newPassword })).body.error.code).toBe('AUTH_TOKEN_EXPIRED')
  })

  it('15. nunca concede privilégio administrativo pelo cadastro público', async () => {
    const email = address('role')
    const response = await request(app).post('/api/auth/register').send({ ...registration(email), role: 'ADMIN', status: 'ACTIVE' })
    expect(response.body.data.role).toBe('USER')
    const stored = await database.user.findUniqueOrThrow({ where: { email } })
    expect(stored.role).toBe('USER')
    expect(stored.status).toBe('PENDING')
  })

  it('16. preserva a conta pendente quando o provedor está indisponível e permite reenviar depois', async () => {
    const email = address('provider-unavailable')
    const unavailableSender: EmailSender = {
      async sendEmailConfirmation() {
        throw new AppError('Provedor indisponível para o teste.', 503, 'EMAIL_PROVIDER_NOT_CONFIGURED')
      },
      async sendPasswordReset() {
        throw new AppError('Provedor indisponível para o teste.', 503, 'EMAIL_PROVIDER_NOT_CONFIGURED')
      },
    }
    app = createApp({
      databaseProvider: () => database,
      authOptions: {
        configProvider: () => config,
        emailSenderProvider: () => unavailableSender,
        now: () => new Date(Date.now() + clockOffsetMs),
        rateLimiter: new AuthRateLimiter(config.csrfSecret),
      },
    })

    const created = await request(app).post('/api/auth/register').send(registration(email))
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.emailDelivery).toEqual({
      status: 'PENDING',
      code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    })
    expect(created.body.message).toContain('Conta criada')
    expect(await database.user.count({ where: { email } })).toBe(1)
    expect(await database.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      status: 'PENDING',
      emailConfirmedAt: null,
    })

    app = createApp({
      databaseProvider: () => database,
      authOptions: {
        configProvider: () => config,
        emailSenderProvider: () => emailSender,
        now: () => new Date(Date.now() + clockOffsetMs),
        rateLimiter: new AuthRateLimiter(config.csrfSecret),
      },
    })
    const resent = await request(app).post('/api/auth/resend-confirmation').send({ email })
    expect(resent.status, JSON.stringify(resent.body)).toBe(202)
    expect(confirmations.get(email)).toBeTypeOf('string')
    expect(await database.user.count({ where: { email } })).toBe(1)
  })
})

function address(label: string) { return `${prefix}-${label}@example.com`.toLowerCase() }
function registration(email: string) { return { name: 'Pessoa Teste', email, password, passwordConfirmation: password } }
async function register(email: string) {
  const response = await request(app).post('/api/auth/register').send(registration(email))
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return confirmations.get(email)!
}
async function activate(email: string) {
  const token = await register(email)
  const response = await request(app).post('/api/auth/confirm-email').send({ token })
  expect(response.status, JSON.stringify(response.body)).toBe(200)
}
function tokenFrom(url: string) { return new URL(url).searchParams.get('token')! }

function requireSafeDatabaseTestConfiguration() {
  if (process.env.INDICA_DATABASE_IS_EXCLUSIVE !== 'true' || process.env.INDICA_ALLOW_EXCLUSIVE_DB_TESTS !== 'true') {
    throw new Error('Execução recusada: o banco precisa ser exclusivo e explicitamente autorizado.')
  }
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('Execução recusada: DATABASE_URL ausente.')
  const url = new URL(value)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.pathname.replace(/^\//, '')) !== 'indica_dev') {
    throw new Error('Execução recusada: DATABASE_URL precisa apontar para PostgreSQL indica_dev.')
  }
}
