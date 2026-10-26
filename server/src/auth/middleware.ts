import type { RequestHandler, Response } from 'express'
import { AppError } from '../errors/app-error.js'
import { UserStatus, type PrismaClient } from '../generated/prisma/client.js'
import { csrfToken, safeEqual, tokenHash } from './security.js'
import type { AuthConfig } from './config.js'
import type { AuthenticatedRequest, AuthenticationContext, AuthUser } from './types.js'

type DatabaseProvider = () => PrismaClient
type ConfigProvider = () => AuthConfig

export function createAuthenticationMiddleware(
  databaseProvider: DatabaseProvider,
  configProvider: ConfigProvider,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const config = configProvider()
      const credentials = sessionCredentials(request.headers.cookie, config.cookieName)
      if (!credentials) throw unauthorized()
      const session = await databaseProvider().userSession.findUnique({
        where: { id: credentials.id },
        include: {
          user: {
            select: { id: true, name: true, email: true, status: true, role: true, sessionVersion: true },
          },
        },
      })
      const now = new Date()
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= now ||
        session.absoluteExpiresAt <= now ||
        session.user.status !== UserStatus.ACTIVE ||
        session.user.sessionVersion !== session.sessionVersion ||
        !safeEqual(session.verifierHash, tokenHash(credentials.verifier))
      ) {
        clearSessionCookie(response, config)
        throw unauthorized()
      }

      if (now.getTime() - session.lastSeenAt.getTime() >= 5 * 60 * 1000) {
        const nextExpiry = new Date(Math.min(now.getTime() + config.sessionIdleMs, session.absoluteExpiresAt.getTime()))
        await databaseProvider().userSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now, expiresAt: nextExpiry },
        })
      }

      const user: AuthUser = session.user
      const context: AuthenticationContext = {
        user,
        sessionId: session.id,
        csrfToken: csrfToken(config.csrfSecret, session.id),
      }
      ;(request as AuthenticatedRequest).auth = context
      next()
    } catch (cause) {
      next(cause)
    }
  }
}

export function requireCsrfForUnsafeMethods(): RequestHandler {
  return (request, _response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      next()
      return
    }
    const auth = (request as AuthenticatedRequest).auth
    const received = request.header('x-csrf-token') ?? ''
    if (!auth || !received || !safeEqual(received, auth.csrfToken)) {
      next(new AppError('A validação de segurança da requisição falhou.', 403, 'CSRF_VALIDATION_FAILED'))
      return
    }
    next()
  }
}

export function createTestAuthenticationMiddleware(user: AuthUser): RequestHandler {
  return (request, _response, next) => {
    ;(request as AuthenticatedRequest).auth = {
      user,
      sessionId: '00000000-0000-4000-8000-000000000001',
      csrfToken: 'test-csrf-token',
    }
    next()
  }
}

export function injectAuthenticatedActor(): RequestHandler {
  return (request, _response, next) => {
    const auth = (request as AuthenticatedRequest).auth
    if (!auth) {
      next(unauthorized())
      return
    }
    if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
      request.body.actorIdentifier = auth.user.email
    }
    next()
  }
}

export function authenticatedUser(request: AuthenticatedRequest) {
  if (!request.auth) throw unauthorized()
  return request.auth.user
}

export function setSessionCookie(response: Response, config: AuthConfig, value: string) {
  response.cookie(config.cookieName, value, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sessionAbsoluteMs,
  })
}

export function clearSessionCookie(response: Response, config: AuthConfig) {
  response.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
  })
}

function sessionCredentials(header: string | undefined, cookieName: string) {
  if (!header) return null
  const cookie = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))
  if (!cookie) return null
  const value = decodeURIComponent(cookie.slice(cookieName.length + 1))
  const separator = value.indexOf('.')
  if (separator < 1) return null
  const id = value.slice(0, separator)
  const verifier = value.slice(separator + 1)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[A-Za-z0-9_-]{32,}$/.test(verifier)) return null
  return { id, verifier }
}

function unauthorized() {
  return new AppError('Sua sessão é inválida ou expirou. Entre novamente.', 401, 'AUTHENTICATION_REQUIRED')
}
