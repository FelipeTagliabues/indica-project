import express from 'express'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import type { PrismaClient } from './generated/prisma/client.js'
import { getPrismaClient } from './lib/prisma.js'
import { healthRouter } from './routes/health.js'
import { createImportsRouter, type ImportRouteOptions } from './routes/imports.js'
import { createRegistrationsRouter } from './routes/registrations.js'
import { createResultsRouter } from './routes/results.js'

type AppOptions = {
  databaseProvider?: () => PrismaClient
  importOptions?: ImportRouteOptions
}

export function createApp(options: AppOptions = {}) {
  const app = express()
  const databaseProvider = options.databaseProvider ?? getPrismaClient

  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/health', healthRouter)
  app.use('/api/registrations', createRegistrationsRouter(databaseProvider))
  app.use('/api/results', createResultsRouter(databaseProvider))
  app.use('/api/imports', createImportsRouter(databaseProvider, options.importOptions))
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
