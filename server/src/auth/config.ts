import { z } from 'zod'
import { AppError } from '../errors/app-error.js'

export type AuthConfig = {
  appBaseUrl: string
  csrfSecret: string
  cookieName: string
  secureCookies: boolean
  sessionIdleMs: number
  sessionAbsoluteMs: number
  confirmationTokenMs: number
  passwordResetTokenMs: number
  resendCooldownMs: number
}

const schema = z.object({
  APP_BASE_URL: z.string().url(),
  AUTH_CSRF_SECRET: z.string().min(32),
  AUTH_COOKIE_NAME: z.string().min(3).max(80).default('indica_session'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export function getAuthConfig(): AuthConfig {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    throw new AppError(
      'Autenticação indisponível: configure APP_BASE_URL e AUTH_CSRF_SECRET.',
      503,
      'AUTH_NOT_CONFIGURED',
    )
  }
  return {
    appBaseUrl: parsed.data.APP_BASE_URL.replace(/\/$/, ''),
    csrfSecret: parsed.data.AUTH_CSRF_SECRET,
    cookieName: parsed.data.AUTH_COOKIE_NAME,
    secureCookies: parsed.data.NODE_ENV === 'production',
    sessionIdleMs: 30 * 60 * 1000,
    sessionAbsoluteMs: 7 * 24 * 60 * 60 * 1000,
    confirmationTokenMs: 24 * 60 * 60 * 1000,
    passwordResetTokenMs: 60 * 60 * 1000,
    resendCooldownMs: 60 * 1000,
  }
}
