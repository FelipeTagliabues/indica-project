import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import {
  AuthTokenType,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '../generated/prisma/client.js'
import { getPrismaClient } from '../lib/prisma.js'
import { getAuthConfig, type AuthConfig } from '../auth/config.js'
import { createSmtpEmailSender } from '../auth/email.js'
import {
  authenticatedUser,
  clearSessionCookie,
  createAuthenticationMiddleware,
  requireCsrfForUnsafeMethods,
  setSessionCookie,
} from '../auth/middleware.js'
import { AuthRateLimiter } from '../auth/rate-limiter.js'
import {
  consumeUnknownPasswordTime,
  csrfToken,
  hashPassword,
  normalizeEmail,
  randomToken,
  tokenHash,
  verifyPassword,
} from '../auth/security.js'
import { publicUser, type AuthenticatedRequest, type EmailSender } from '../auth/types.js'

type DatabaseProvider = () => PrismaClient

export type AuthRouteOptions = {
  configProvider?: () => AuthConfig
  emailSenderProvider?: () => EmailSender
  now?: () => Date
  rateLimiter?: AuthRateLimiter
}

const emailSchema = z.string().trim().email('Informe um e-mail válido.').max(254).transform(normalizeEmail)
export const passwordSchema = z
  .string()
  .min(12, 'Use ao menos 12 caracteres.')
  .max(128, 'Use no máximo 128 caracteres.')
  .regex(/[a-z]/, 'Inclua ao menos uma letra minúscula.')
  .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula.')
  .regex(/[0-9]/, 'Inclua ao menos um número.')

const registerSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo.').max(160),
  email: emailSchema,
  password: passwordSchema,
  passwordConfirmation: z.string(),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ['passwordConfirmation'],
  message: 'A confirmação não corresponde à senha.',
})

const tokenSchema = z.object({ token: z.string().min(32).max(200) })
const resendSchema = z.object({ email: emailSchema })
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) })
const forgotSchema = z.object({ email: emailSchema })
const resetSchema = tokenSchema.extend({
  password: passwordSchema,
  passwordConfirmation: z.string(),
}).refine((value) => value.password === value.passwordConfirmation, {
  path: ['passwordConfirmation'],
  message: 'A confirmação não corresponde à senha.',
})

export function createAuthRouter(
  databaseProvider: DatabaseProvider = getPrismaClient,
  options: AuthRouteOptions = {},
) {
  const router = Router()
  const configProvider = options.configProvider ?? getAuthConfig
  const emailSenderProvider = options.emailSenderProvider ?? createSmtpEmailSender
  const now = options.now ?? (() => new Date())
  let defaultRateLimiter: AuthRateLimiter | undefined
  const limiter = () => options.rateLimiter ?? (defaultRateLimiter ??= new AuthRateLimiter(
    configProvider().csrfSecret,
    () => now().getTime(),
  ))

  router.post('/register', async (request, response) => {
    const input = registerSchema.parse(request.body)
    const config = configProvider()
    limiter().consume('register', request.ip ?? 'unknown', 5, 60 * 60 * 1000)
    const database = databaseProvider()
    if (await database.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new AppError('Já existe uma conta com este e-mail.', 409, 'EMAIL_ALREADY_REGISTERED')
    }

    const passwordHash = await hashPassword(input.password)
    const rawToken = randomToken()
    const created = await database.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          status: UserStatus.PENDING,
          role: UserRole.USER,
        },
        select: { id: true, name: true, email: true, status: true, role: true },
      })
      const authToken = await transaction.authToken.create({
        data: {
          userId: user.id,
          type: AuthTokenType.EMAIL_CONFIRMATION,
          tokenHash: tokenHash(rawToken),
          expiresAt: new Date(now().getTime() + config.confirmationTokenMs),
        },
      })
      return { user, authToken }
    })

    let emailDelivery: {
      status: 'SENT' | 'PENDING'
      code?: 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_DELIVERY_FAILED'
    } = { status: 'SENT' }

    try {
      await emailSenderProvider().sendEmailConfirmation({
        to: created.user.email,
        name: created.user.name,
        confirmationUrl: `${config.appBaseUrl}/confirmar-email?token=${encodeURIComponent(rawToken)}`,
      })
    } catch (cause) {
      emailDelivery = {
        status: 'PENDING',
        code: cause instanceof AppError && cause.code === 'EMAIL_PROVIDER_NOT_CONFIGURED'
          ? 'EMAIL_PROVIDER_NOT_CONFIGURED'
          : 'EMAIL_DELIVERY_FAILED',
      }
    }

    if (emailDelivery.status === 'SENT') {
      await database.authToken.update({ where: { id: created.authToken.id }, data: { sentAt: now() } })
    }

    response.status(201).json({
      data: publicUser(created.user),
      message: emailDelivery.status === 'SENT'
        ? 'Conta criada. Confirme o e-mail antes de entrar.'
        : 'Conta criada, mas o e-mail de confirmação ainda não foi enviado. Solicite o reenvio quando o serviço estiver disponível.',
      emailDelivery,
    })
  })

  router.post('/confirm-email', async (request, response) => {
    const input = tokenSchema.parse(request.body)
    const database = databaseProvider()
    const instant = now()
    const stored = await database.authToken.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      include: { user: { select: { id: true, status: true } } },
    })
    validateStoredToken(stored, AuthTokenType.EMAIL_CONFIRMATION, instant)
    if (stored!.user.status === UserStatus.DISABLED) {
      throw new AppError('Esta conta está desabilitada.', 403, 'ACCOUNT_DISABLED')
    }

    await database.$transaction(async (transaction) => {
      const consumed = await transaction.authToken.updateMany({
        where: { id: stored!.id, usedAt: null, expiresAt: { gt: instant } },
        data: { usedAt: instant },
      })
      if (consumed.count !== 1) throw tokenAlreadyUsed()
      await transaction.user.update({
        where: { id: stored!.userId },
        data: { status: UserStatus.ACTIVE, emailConfirmedAt: instant },
      })
      await transaction.authToken.updateMany({
        where: {
          userId: stored!.userId,
          type: AuthTokenType.EMAIL_CONFIRMATION,
          usedAt: null,
          id: { not: stored!.id },
        },
        data: { usedAt: instant },
      })
    })
    response.json({ message: 'E-mail confirmado. Sua conta já pode acessar o Indica.' })
  })

  router.post('/resend-confirmation', async (request, response) => {
    const input = resendSchema.parse(request.body)
    const config = configProvider()
    limiter().consume('resend-confirmation', `${request.ip ?? 'unknown'}:${input.email}`, 5, 60 * 60 * 1000)
    const database = databaseProvider()
    const user = await database.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, status: true },
    })
    if (!user || user.status !== UserStatus.PENDING) {
      response.status(202).json({ message: 'Se a conta estiver pendente, um novo e-mail será enviado quando permitido.' })
      return
    }
    const latest = await database.authToken.findFirst({
      where: { userId: user.id, type: AuthTokenType.EMAIL_CONFIRMATION, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
    })
    const elapsed = latest?.sentAt ? now().getTime() - latest.sentAt.getTime() : Number.POSITIVE_INFINITY
    if (elapsed < config.resendCooldownMs) {
      throw new AppError(
        'Aguarde antes de solicitar outro e-mail.',
        429,
        'CONFIRMATION_RESEND_TOO_SOON',
        { retryAfterSeconds: Math.ceil((config.resendCooldownMs - elapsed) / 1000) },
      )
    }

    const rawToken = randomToken()
    const instant = now()
    const created = await database.$transaction(async (transaction) => {
      await transaction.authToken.updateMany({
        where: { userId: user.id, type: AuthTokenType.EMAIL_CONFIRMATION, usedAt: null },
        data: { usedAt: instant },
      })
      return transaction.authToken.create({
        data: {
          userId: user.id,
          type: AuthTokenType.EMAIL_CONFIRMATION,
          tokenHash: tokenHash(rawToken),
          expiresAt: new Date(instant.getTime() + config.confirmationTokenMs),
        },
      })
    })
    try {
      await emailSenderProvider().sendEmailConfirmation({
        to: user.email,
        name: user.name,
        confirmationUrl: `${config.appBaseUrl}/confirmar-email?token=${encodeURIComponent(rawToken)}`,
      })
      await database.authToken.update({ where: { id: created.id }, data: { sentAt: now() } })
    } catch (cause) {
      if (cause instanceof AppError) throw cause
      throw new AppError('O provedor não confirmou o reenvio.', 503, 'EMAIL_DELIVERY_FAILED')
    }
    response.status(202).json({ message: 'Novo e-mail de confirmação enviado.' })
  })

  router.post('/login', async (request, response) => {
    const input = loginSchema.parse(request.body)
    const identity = `${request.ip ?? 'unknown'}:${input.email}`
    limiter().consume('login', identity, 5, 15 * 60 * 1000)
    const database = databaseProvider()
    const user = await database.user.findUnique({ where: { email: input.email } })
    if (!user) {
      await consumeUnknownPasswordTime(input.password)
      throw invalidCredentials()
    }
    if (!await verifyPassword(user.passwordHash, input.password)) throw invalidCredentials()
    if (user.status === UserStatus.PENDING) {
      throw new AppError('Confirme seu e-mail antes de entrar.', 403, 'EMAIL_CONFIRMATION_REQUIRED')
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError('Esta conta está desabilitada.', 403, 'ACCOUNT_DISABLED')
    }
    limiter().clear('login', identity)

    const config = configProvider()
    const instant = now()
    const verifier = randomToken()
    const absoluteExpiresAt = new Date(instant.getTime() + config.sessionAbsoluteMs)
    const expiresAt = new Date(Math.min(instant.getTime() + config.sessionIdleMs, absoluteExpiresAt.getTime()))
    const session = await database.userSession.create({
      data: {
        userId: user.id,
        verifierHash: tokenHash(verifier),
        sessionVersion: user.sessionVersion,
        expiresAt,
        absoluteExpiresAt,
        createdAt: instant,
        lastSeenAt: instant,
      },
    })
    const csrf = csrfToken(config.csrfSecret, session.id)
    setSessionCookie(response, config, `${session.id}.${verifier}`)
    response.json({ data: { user: publicUser(user), csrfToken: csrf } })
  })

  router.post('/forgot-password', async (request, response) => {
    const input = forgotSchema.parse(request.body)
    const config = configProvider()
    limiter().consume('forgot-password', `${request.ip ?? 'unknown'}:${input.email}`, 5, 60 * 60 * 1000)
    const database = databaseProvider()
    const user = await database.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, status: true },
    })
    if (user?.status === UserStatus.ACTIVE) {
      const rawToken = randomToken()
      const instant = now()
      const created = await database.$transaction(async (transaction) => {
        await transaction.authToken.updateMany({
          where: { userId: user.id, type: AuthTokenType.PASSWORD_RESET, usedAt: null },
          data: { usedAt: instant },
        })
        return transaction.authToken.create({
          data: {
            userId: user.id,
            type: AuthTokenType.PASSWORD_RESET,
            tokenHash: tokenHash(rawToken),
            expiresAt: new Date(instant.getTime() + config.passwordResetTokenMs),
          },
        })
      })
      try {
        await emailSenderProvider().sendPasswordReset({
          to: user.email,
          name: user.name,
          resetUrl: `${config.appBaseUrl}/redefinir-senha?token=${encodeURIComponent(rawToken)}`,
        })
        await database.authToken.update({ where: { id: created.id }, data: { sentAt: now() } })
      } catch {
        // The public response remains indistinguishable to avoid account enumeration.
      }
    }
    response.status(202).json({
      message: 'Se existir uma conta confirmada e o envio estiver disponível, você receberá as instruções.',
    })
  })

  router.post('/reset-password', async (request, response) => {
    const input = resetSchema.parse(request.body)
    const database = databaseProvider()
    const instant = now()
    const stored = await database.authToken.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      include: { user: { select: { id: true, status: true } } },
    })
    validateStoredToken(stored, AuthTokenType.PASSWORD_RESET, instant)
    if (stored!.user.status !== UserStatus.ACTIVE) {
      throw new AppError('Esta conta não pode redefinir a senha.', 403, 'ACCOUNT_NOT_ACTIVE')
    }
    const passwordHash = await hashPassword(input.password)
    await database.$transaction(async (transaction) => {
      const consumed = await transaction.authToken.updateMany({
        where: { id: stored!.id, usedAt: null, expiresAt: { gt: instant } },
        data: { usedAt: instant },
      })
      if (consumed.count !== 1) throw tokenAlreadyUsed()
      await transaction.user.update({
        where: { id: stored!.userId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      })
      await transaction.userSession.updateMany({
        where: { userId: stored!.userId, revokedAt: null },
        data: { revokedAt: instant },
      })
      await transaction.authToken.updateMany({
        where: {
          userId: stored!.userId,
          type: AuthTokenType.PASSWORD_RESET,
          usedAt: null,
          id: { not: stored!.id },
        },
        data: { usedAt: instant },
      })
    })
    response.json({ message: 'Senha redefinida. Entre novamente com a nova senha.' })
  })

  const requireAuthentication = createAuthenticationMiddleware(databaseProvider, configProvider)
  router.get('/session', requireAuthentication, async (request, response) => {
    const authRequest = request as AuthenticatedRequest
    response.json({ data: { user: publicUser(authenticatedUser(authRequest)), csrfToken: authRequest.auth!.csrfToken } })
  })
  router.post('/logout', requireAuthentication, requireCsrfForUnsafeMethods(), async (request, response) => {
    const authRequest = request as AuthenticatedRequest
    await databaseProvider().userSession.updateMany({
      where: { id: authRequest.auth!.sessionId, revokedAt: null },
      data: { revokedAt: now() },
    })
    clearSessionCookie(response, configProvider())
    response.status(204).end()
  })

  return router
}

function validateStoredToken(
  token: { type: AuthTokenType; usedAt: Date | null; expiresAt: Date } | null,
  expectedType: AuthTokenType,
  now: Date,
) {
  if (!token || token.type !== expectedType) {
    throw new AppError('O link informado é inválido.', 400, 'AUTH_TOKEN_INVALID')
  }
  if (token.usedAt) throw tokenAlreadyUsed()
  if (token.expiresAt <= now) {
    throw new AppError('Este link expirou. Solicite um novo.', 400, 'AUTH_TOKEN_EXPIRED')
  }
}

function invalidCredentials() {
  return new AppError('E-mail ou senha inválidos.', 401, 'INVALID_CREDENTIALS')
}

function tokenAlreadyUsed() {
  return new AppError('Este link já foi utilizado.', 400, 'AUTH_TOKEN_USED')
}
