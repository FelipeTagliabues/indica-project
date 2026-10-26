import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi, authFetch, setCsrfToken } from '@/lib/auth-api'

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
})

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}
