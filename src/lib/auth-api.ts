export type AuthUser = {
  id: string
  name: string
  email: string
  status: 'PENDING' | 'ACTIVE' | 'DISABLED'
  role: 'USER' | 'ADMIN'
}

export type RegistrationResult = {
  data: AuthUser
  message: string
  emailDelivery: {
    status: 'SENT' | 'PENDING'
    code?: 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'EMAIL_DELIVERY_FAILED'
  }
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: Array<{ field?: string; message: string }> }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
let csrfToken: string | null = null

export class AuthApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
  }
}

export function setCsrfToken(value: string | null) {
  csrfToken = value
}

export async function authFetch(path: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData) && init.body !== undefined) headers.set('content-type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('x-csrf-token', csrfToken)
  const url = /^https?:\/\//i.test(path) ? path : `${apiBaseUrl}${path}`
  const response = await fetch(url, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && !path.endsWith('/login') && !path.endsWith('/session')) {
    setCsrfToken(null)
    window.dispatchEvent(new Event('indica:unauthorized'))
  }
  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await authFetch(`/api/auth${path}`, init)
  } catch {
    throw new AuthApiError(
      'Não foi possível comunicar com a API. Verifique se o serviço está em execução.',
      0,
      'API_UNREACHABLE',
    )
  }
  const payload = await response.json().catch(() => null) as T | ErrorEnvelope | null
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined
    const details = error?.details?.map((item) => item.message).join(' ') ?? ''
    const fallbackMessage = response.status >= 500
      ? 'O serviço de autenticação está indisponível. Tente novamente após iniciar a API.'
      : 'Não foi possível concluir a operação.'
    throw new AuthApiError(
      [error?.message ?? fallbackMessage, details].filter(Boolean).join(' '),
      response.status,
      error?.code ?? (response.status >= 500 ? 'AUTH_SERVICE_UNAVAILABLE' : undefined),
    )
  }
  return payload as T
}

export const authApi = {
  register: (input: { name: string; email: string; password: string; passwordConfirmation: string }) =>
    request<RegistrationResult>('/register', { method: 'POST', body: JSON.stringify(input) }),
  confirmEmail: (token: string) =>
    request<{ message: string }>('/confirm-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendConfirmation: (email: string) =>
    request<{ message: string }>('/resend-confirmation', { method: 'POST', body: JSON.stringify({ email }) }),
  login: async (email: string, password: string) => {
    const payload = await request<{ data: { user: AuthUser; csrfToken: string } }>('/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    })
    setCsrfToken(payload.data.csrfToken)
    return payload.data.user
  },
  session: async () => {
    const payload = await request<{ data: { user: AuthUser; csrfToken: string } }>('/session')
    setCsrfToken(payload.data.csrfToken)
    return payload.data.user
  },
  logout: async () => {
    await request<null>('/logout', { method: 'POST' })
    setCsrfToken(null)
  },
  forgotPassword: (email: string) =>
    request<{ message: string }>('/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (input: { token: string; password: string; passwordConfirmation: string }) =>
    request<{ message: string }>('/reset-password', { method: 'POST', body: JSON.stringify(input) }),
}
