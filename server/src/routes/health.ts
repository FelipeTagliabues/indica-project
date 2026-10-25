import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'indica-api',
    database: 'not_checked',
    timestamp: new Date().toISOString(),
  })
})
