import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { Prisma } from '../generated/prisma/client.js'
import { AppError } from '../errors/app-error.js'

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(`Rota não encontrada: ${request.method} ${request.path}`, 404, 'ROUTE_NOT_FOUND'))
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  void _next

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    })
    return
  }

  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: {
        code: 'UPLOAD_INVALID',
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'O arquivo excede o limite de 5 MB.'
          : 'Não foi possível receber o arquivo enviado.',
      },
    })
    return
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Revise os campos informados.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    })
    return
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      response.status(409).json({
        error: {
          code: 'UNIQUE_CONFLICT',
          message: 'Já existe um cadastro com os mesmos dados únicos.',
        },
      })
      return
    }

    if (error.code === 'P2003') {
      response.status(409).json({
        error: {
          code: 'RELATION_CONFLICT',
          message: 'O cadastro está vinculado a dados incompatíveis ou inexistentes.',
        },
      })
      return
    }

    if (error.code === 'P2025') {
      response.status(404).json({
        error: {
          code: 'RECORD_NOT_FOUND',
          message: 'Cadastro não encontrado.',
        },
      })
      return
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    response.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Não foi possível acessar a persistência configurada.',
      },
    })
    return
  }

  const databaseConstraint = findDatabaseConstraint(error)
  if (databaseConstraint === 'operator_assignments_no_overlap') {
    response.status(409).json({
      error: {
        code: 'ASSIGNMENT_PERIOD_CONFLICT',
        message: 'O operador já possui uma atribuição vigente nesse período.',
      },
    })
    return
  }

  if (databaseConstraint?.startsWith('operator_assignments_')) {
    response.status(409).json({
      error: {
        code: 'ASSIGNMENT_CONFLICT',
        message: 'A atribuição conflita com o histórico ou com os vínculos informados.',
      },
    })
    return
  }

  console.error(error)
  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno do servidor.',
    },
  })
}

function findDatabaseConstraint(error: unknown): string | undefined {
  const knownConstraints = [
    'operator_assignments_no_overlap',
    'operator_assignments_skuId_environmentId_fkey',
    'operator_assignments_supervisorId_environmentId_fkey',
    'operator_assignments_history_identity_check',
    'operator_assignments_history_period_check',
  ]
  const visited = new Set<unknown>()
  let current = error

  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current)
    const record = current as Record<string, unknown>
    if (typeof record.constraint === 'string') return record.constraint
    if (typeof record.message === 'string') {
      const message = record.message
      const constraint = knownConstraints.find((name) => message.includes(name))
      if (constraint) return constraint
    }

    const meta = record.meta
    if (meta && typeof meta === 'object') {
      const constraint = (meta as Record<string, unknown>).constraint
      if (typeof constraint === 'string') return constraint
    }

    current = record.cause
  }

  return undefined
}
