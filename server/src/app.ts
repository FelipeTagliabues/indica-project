import express from 'express'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import type { PrismaClient } from './generated/prisma/client.js'
import { getPrismaClient } from './lib/prisma.js'
import { healthRouter } from './routes/health.js'
import { createImportsRouter, type ImportRouteOptions } from './routes/imports.js'
import { createRegistrationsRouter } from './routes/registrations.js'
import { createResultsRouter } from './routes/results.js'
import { createAuthRouter, type AuthRouteOptions } from './routes/auth.js'
import { getAuthConfig } from './auth/config.js'
import {
  createAuthenticationMiddleware,
  createTestAuthenticationMiddleware,
  injectAuthenticatedActor,
  requireCsrfForUnsafeMethods,
} from './auth/middleware.js'
import type { AuthUser } from './auth/types.js'

export type AppOptions = {
  databaseProvider?: () => PrismaClient
  importOptions?: ImportRouteOptions
  authOptions?: AuthRouteOptions
  authenticationBypass?: AuthUser
}

export function createApp(options: AppOptions = {}) {
  const app = express()
  const databaseProvider = options.databaseProvider ?? getPrismaClient

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/health', healthRouter)
  app.use('/api/auth', createAuthRouter(databaseProvider, options.authOptions))

  const authenticate = options.authenticationBypass
    ? createTestAuthenticationMiddleware(options.authenticationBypass)
    : createAuthenticationMiddleware(databaseProvider, options.authOptions?.configProvider ?? getAuthConfig)
  const protect = options.authenticationBypass
    ? [authenticate, injectAuthenticatedActor()]
    : [authenticate, requireCsrfForUnsafeMethods(), injectAuthenticatedActor()]
  app.use('/api/registrations', ...protect, createRegistrationsRouter(databaseProvider))
  app.use('/api/results', ...protect, createResultsRouter(databaseProvider))
  app.use('/api/imports', ...protect, createImportsRouter(databaseProvider, options.importOptions))
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
