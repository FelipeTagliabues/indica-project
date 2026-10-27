import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError, authApi, authFetch, setCsrfToken } from '@/lib/auth-api'

const user = {
  id: 'user-id',
  name: 'Pessoa Teste',
  email: 'pessoa@example.com',
  status: 'ACTIVE' as const,
  role: 'USER' as const,
}

describe('cliente web de autenticação', () => {
  afterEach(() => {
    setCsrfToken(null)
    vi.unstubAllGlobals()
  })

  it('inclui cookies e envia o CSRF recebido no login em escritas posteriores', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: { user, csrfToken: 'csrf-seguro' } }))
      .mockResolvedValueOnce(response({ data: {} }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await authApi.login(user.email, 'SenhaSegura123')
    await authFetch('/api/registrations/environments', { method: 'POST', body: '{}' })

    const loginInit = fetchMock.mock.calls[0][1] as RequestInit
    const writeInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(loginInit.credentials).toBe('include')
    expect(writeInit.credentials).toBe('include')
    expect(new Headers(writeInit.headers).get('x-csrf-token')).toBe('csrf-seguro')
  })

  it('restaura sessão usando cookie sem persistir token no navegador', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { user, csrfToken: 'csrf-restaurado' } }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await authApi.session()).toEqual(user)
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('include')
  })

  it('preserva o estado de entrega pendente retornado pelo cadastro', async () => {
    const payload = {
      data: { ...user, status: 'PENDING' as const },
      message: 'Conta criada, mas o e-mail ainda não foi enviado.',
      emailDelivery: { status: 'PENDING' as const, code: 'EMAIL_PROVIDER_NOT_CONFIGURED' as const },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload, 201)))

    await expect(authApi.register({
      name: user.name,
      email: user.email,
      password: 'SenhaSegura123',
      passwordConfirmation: 'SenhaSegura123',
    })).resolves.toEqual(payload)
  })

  it('diferencia indisponibilidade de comunicação de uma falha genérica', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await authApi.register({
      name: user.name,
      email: user.email,
      password: 'SenhaSegura123',
      passwordConfirmation: 'SenhaSegura123',
    }).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(AuthApiError)
    expect(error).toMatchObject({ status: 0, code: 'API_UNREACHABLE' })
    expect((error as Error).message).toMatch(/comunicar com a API/i)
  })

  it('trata resposta inválida do proxy como serviço indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError('Resposta não JSON') },
    }))

    const error = await authApi.register({
      name: user.name,
      email: user.email,
      password: 'SenhaSegura123',
      passwordConfirmation: 'SenhaSegura123',
    }).catch((cause: unknown) => cause)

    expect(error).toMatchObject({ status: 500, code: 'AUTH_SERVICE_UNAVAILABLE' })
    expect((error as Error).message).toMatch(/serviço de autenticação está indisponível/i)
  })
})

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}
