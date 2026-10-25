import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import {
  AuditActorKind,
  AuditOperation,
  ResultStatus,
  type Prisma,
  type PrismaClient,
} from '../generated/prisma/client.js'
import { getPrismaClient } from '../lib/prisma.js'

type DatabaseProvider = () => PrismaClient

const uuidSchema = z.string().uuid('Identificador inválido.')
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato AAAA-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  }, 'Informe uma data válida.')
const actorSchema = z.string().trim().min(3, 'Informe o responsável pela alteração.').max(160)
const decimalWithTwoPlaces = z.number().finite().refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
  'Use no máximo duas casas decimais.',
)

const metricSchema = z.object({
  nps: decimalWithTwoPlaces.min(-100).max(100),
  tmaSeconds: z.number().int().min(0),
  cardRetention: decimalWithTwoPlaces.min(0).max(100),
  callbackRate: decimalWithTwoPlaces.min(0).max(100),
})

const createResultSchema = metricSchema.extend({
  assignmentId: uuidSchema,
  resultDate: dateSchema,
  actorIdentifier: actorSchema,
})

const updateResultSchema = createResultSchema.extend({
  version: z.number().int().min(1),
  confirmReplacement: z.literal(true, {
    error: 'Confirme explicitamente a substituição do registro diário.',
  }),
})

const resultQuerySchema = z.object({
  environmentId: uuidSchema,
  skuId: uuidSchema,
  dateFrom: dateSchema,
  dateTo: dateSchema,
  supervisorId: uuidSchema.optional(),
  operatorId: uuidSchema.optional(),
}).refine((value) => value.dateTo >= value.dateFrom, {
  path: ['dateTo'],
  message: 'A data final não pode ser anterior à data inicial.',
})

export function createResultsRouter(databaseProvider: DatabaseProvider = getPrismaClient) {
  const router = Router()

  router.get('/', async (request, response) => {
    const query = resultQuerySchema.parse(request.query)
    const dateFrom = toDate(query.dateFrom)
    const dateTo = toDate(query.dateTo)
    const database = databaseProvider()

    const [results, targets] = await Promise.all([
      database.dailyResult.findMany({
        where: {
          status: ResultStatus.ACTIVE,
          resultDate: { gte: dateFrom, lte: dateTo },
          assignment: {
            environmentId: query.environmentId,
            skuId: query.skuId,
            ...(query.supervisorId ? { supervisorId: query.supervisorId } : {}),
            ...(query.operatorId ? { operatorId: query.operatorId } : {}),
          },
        },
        orderBy: [{ resultDate: 'desc' }, { assignment: { operator: { name: 'asc' } } }],
        select: resultSelect,
      }),
      database.indicatorTarget.findMany({
        where: {
          environmentId: query.environmentId,
          skuId: query.skuId,
          validFrom: { lte: dateTo },
          OR: [{ validTo: null }, { validTo: { gte: dateTo } }],
        },
        orderBy: { validFrom: 'desc' },
        select: {
          indicator: true,
          value: true,
          validFrom: true,
          validTo: true,
        },
      }),
    ])

    response.json({
      data: results.map(resultResponse),
      meta: {
        targets: targets.map((target) => ({
          indicator: target.indicator,
          value: Number(target.value),
          validFrom: dateValue(target.validFrom),
          validTo: target.validTo ? dateValue(target.validTo) : null,
        })),
      },
    })
  })

  router.post('/', async (request, response) => {
    const input = createResultSchema.parse(request.body)
    const resultDate = toDate(input.resultDate)
    const result = await databaseProvider().$transaction(async (transaction) => {
      const assignment = await requireAssignmentForDate(transaction, input.assignmentId, resultDate)
      const existing = await transaction.dailyResult.findUnique({
        where: { assignmentId_resultDate: { assignmentId: input.assignmentId, resultDate } },
        select: { id: true },
      })
      if (existing) {
        throw new AppError(
          'Já existe um registro para este operador e esta data. Abra o registro existente para substituí-lo.',
          409,
          'DAILY_RESULT_EXISTS',
          { resultId: existing.id },
        )
      }

      const created = await transaction.dailyResult.create({
        data: {
          assignmentId: input.assignmentId,
          resultDate,
          nps: input.nps,
          tmaSeconds: input.tmaSeconds,
          cardRetention: input.cardRetention,
          callbackRate: input.callbackRate,
        },
        select: resultSelect,
      })
      const serialized = resultResponse(created)
      await transaction.auditEvent.create({
        data: {
          environmentId: assignment.environmentId,
          operation: AuditOperation.CREATE,
          entityType: 'DailyResult',
          entityId: created.id,
          actorKind: AuditActorKind.INFORMED,
          actorIdentifier: input.actorIdentifier,
          newValues: serialized as Prisma.InputJsonValue,
        },
      })
      return serialized
    })

    response.status(201).json({ data: result })
  })

  router.put('/:id', async (request, response) => {
    const id = uuidSchema.parse(request.params.id)
    const input = updateResultSchema.parse(request.body)
    const resultDate = toDate(input.resultDate)
    const result = await databaseProvider().$transaction(async (transaction) => {
      const previous = await transaction.dailyResult.findUnique({
        where: { id },
        select: resultSelect,
      })
      if (!previous || previous.status !== ResultStatus.ACTIVE) {
        throw new AppError('Registro diário ativo não encontrado.', 404, 'DAILY_RESULT_NOT_FOUND')
      }

      const assignment = await requireAssignmentForDate(transaction, input.assignmentId, resultDate)
      const update = await transaction.dailyResult.updateMany({
        where: { id, version: input.version, status: ResultStatus.ACTIVE },
        data: {
          assignmentId: input.assignmentId,
          resultDate,
          nps: input.nps,
          tmaSeconds: input.tmaSeconds,
          cardRetention: input.cardRetention,
          callbackRate: input.callbackRate,
        },
      })
      if (update.count !== 1) {
        throw new AppError(
          'O registro foi alterado por outra operação. Atualize a consulta antes de tentar novamente.',
          409,
          'RESULT_VERSION_CONFLICT',
        )
      }

      const updated = await transaction.dailyResult.findUniqueOrThrow({
        where: { id },
        select: resultSelect,
      })
      const previousValues = resultResponse(previous)
      const newValues = resultResponse(updated)
      await transaction.auditEvent.create({
        data: {
          environmentId: assignment.environmentId,
          operation: AuditOperation.CORRECTION,
          entityType: 'DailyResult',
          entityId: updated.id,
          actorKind: AuditActorKind.INFORMED,
          actorIdentifier: input.actorIdentifier,
          previousValues: previousValues as Prisma.InputJsonValue,
          newValues: newValues as Prisma.InputJsonValue,
        },
      })
      return newValues
    })

    response.json({ data: result })
  })

  return router
}

const resultSelect = {
  id: true,
  assignmentId: true,
  resultDate: true,
  nps: true,
  tmaSeconds: true,
  cardRetention: true,
  callbackRate: true,
  version: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignment: {
    select: {
      operator: { select: { id: true, login: true, name: true, admissionDate: true } },
      environment: { select: { id: true, name: true } },
      sku: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.DailyResultSelect

async function requireAssignmentForDate(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
  resultDate: Date,
) {
  const assignment = await transaction.operatorAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      environmentId: true,
      validFrom: true,
      validTo: true,
    },
  })
  if (!assignment) throw new AppError('Atribuição não encontrada.', 404, 'ASSIGNMENT_NOT_FOUND')
  if (resultDate < assignment.validFrom || (assignment.validTo && resultDate > assignment.validTo)) {
    throw new AppError(
      'O operador não possui esta atribuição na data operacional informada.',
      409,
      'ASSIGNMENT_NOT_VALID_ON_DATE',
    )
  }
  return assignment
}

function resultResponse(result: Prisma.DailyResultGetPayload<{ select: typeof resultSelect }>) {
  return {
    id: result.id,
    assignmentId: result.assignmentId,
    resultDate: dateValue(result.resultDate),
    nps: decimalValue(result.nps),
    tmaSeconds: result.tmaSeconds,
    cardRetention: decimalValue(result.cardRetention),
    callbackRate: decimalValue(result.callbackRate),
    version: result.version,
    status: result.status,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
    assignment: {
      operator: {
        ...result.assignment.operator,
        admissionDate: dateValue(result.assignment.operator.admissionDate),
      },
      environment: result.assignment.environment,
      sku: result.assignment.sku,
      supervisor: result.assignment.supervisor,
    },
  }
}

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function dateValue(value: Date) {
  return value.toISOString().slice(0, 10)
}

function decimalValue(value: { toString(): string } | null) {
  return value === null ? null : Number(value)
}
