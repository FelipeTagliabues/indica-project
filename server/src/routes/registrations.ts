import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import {
  AuditActorKind,
  AuditOperation,
  RecordStatus,
  type Prisma,
  type PrismaClient,
} from '../generated/prisma/client.js'
import { getPrismaClient } from '../lib/prisma.js'

type DatabaseProvider = () => PrismaClient

const uuidSchema = z.string().uuid('Identificador inválido.')
const actorSchema = z.string().trim().min(3, 'Informe o responsável pela alteração.').max(160)
const nameSchema = z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(160)
const codeSchema = z
  .string()
  .trim()
  .min(2, 'Informe ao menos 2 caracteres.')
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use somente letras, números, hífen e sublinhado.')
  .transform((value) => value.toUpperCase())
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato AAAA-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  }, 'Informe uma data válida.')

const environmentSchema = z.object({
  code: codeSchema,
  name: nameSchema.max(120),
  actorIdentifier: actorSchema,
})

const skuSchema = z.object({
  environmentId: uuidSchema,
  code: codeSchema,
  name: nameSchema.max(120),
  actorIdentifier: actorSchema,
})

const supervisorSchema = z.object({
  environmentId: uuidSchema,
  name: nameSchema,
  actorIdentifier: actorSchema,
})

const operatorSchema = z.object({
  login: z.string().trim().min(2, 'Informe o login.').max(100),
  name: nameSchema,
  admissionDate: dateSchema,
  actorIdentifier: actorSchema,
})

const assignmentSchema = z.object({
  operatorId: uuidSchema,
  environmentId: uuidSchema,
  skuId: uuidSchema,
  supervisorId: uuidSchema,
  validFrom: dateSchema,
  validTo: dateSchema.nullable().optional(),
  actorIdentifier: actorSchema,
})

const assignmentPeriodSchema = z.object({
  validFrom: dateSchema.optional(),
  validTo: dateSchema.nullable().optional(),
  actorIdentifier: actorSchema,
}).refine((value) => value.validFrom !== undefined || value.validTo !== undefined, {
  message: 'Informe ao menos uma data para alterar a vigência.',
})

const operatorStatusSchema = z.object({
  status: z.enum([RecordStatus.ACTIVE, RecordStatus.INACTIVE]),
  actorIdentifier: actorSchema,
})

const environmentQuerySchema = z.object({ environmentId: uuidSchema.optional() })
const assignmentQuerySchema = z.object({ operatorId: uuidSchema.optional() })

export function createRegistrationsRouter(databaseProvider: DatabaseProvider = getPrismaClient) {
  const router = Router()

  router.get('/environments', async (_request, response) => {
    const environments = await databaseProvider().environment.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: environmentSelect,
    })
    response.json({ data: environments })
  })

  router.post('/environments', async (request, response) => {
    const input = environmentSchema.parse(request.body)
    const environment = await databaseProvider().$transaction(async (transaction) => {
      const created = await transaction.environment.create({
        data: { code: input.code, name: input.name },
        select: environmentSelect,
      })
      await createAuditEvent(transaction, {
        environmentId: created.id,
        entityType: 'Environment',
        entityId: created.id,
        actorIdentifier: input.actorIdentifier,
        newValues: dateSafe(created),
      })
      return created
    })
    response.status(201).json({ data: environment })
  })

  router.get('/skus', async (request, response) => {
    const query = environmentQuerySchema.parse(request.query)
    const skus = await databaseProvider().sku.findMany({
      ...(query.environmentId ? { where: { environmentId: query.environmentId } } : {}),
      orderBy: [{ environment: { name: 'asc' } }, { name: 'asc' }],
      select: skuSelect,
    })
    response.json({ data: skus })
  })

  router.post('/skus', async (request, response) => {
    const input = skuSchema.parse(request.body)
    const sku = await databaseProvider().$transaction(async (transaction) => {
      await requireEnvironment(transaction, input.environmentId)
      const created = await transaction.sku.create({
        data: {
          environmentId: input.environmentId,
          code: input.code,
          name: input.name,
        },
        select: skuSelect,
      })
      await createAuditEvent(transaction, {
        environmentId: created.environmentId,
        entityType: 'Sku',
        entityId: created.id,
        actorIdentifier: input.actorIdentifier,
        newValues: dateSafe(created),
      })
      return created
    })
    response.status(201).json({ data: sku })
  })

  router.get('/supervisors', async (request, response) => {
    const query = environmentQuerySchema.parse(request.query)
    const supervisors = await databaseProvider().supervisor.findMany({
      ...(query.environmentId ? { where: { environmentId: query.environmentId } } : {}),
      orderBy: [{ environment: { name: 'asc' } }, { name: 'asc' }],
      select: supervisorSelect,
    })
    response.json({ data: supervisors })
  })

  router.post('/supervisors', async (request, response) => {
    const input = supervisorSchema.parse(request.body)
    const supervisor = await databaseProvider().$transaction(async (transaction) => {
      await requireEnvironment(transaction, input.environmentId)
      const created = await transaction.supervisor.create({
        data: { environmentId: input.environmentId, name: input.name },
        select: supervisorSelect,
      })
      await createAuditEvent(transaction, {
        environmentId: created.environmentId,
        entityType: 'Supervisor',
        entityId: created.id,
        actorIdentifier: input.actorIdentifier,
        newValues: dateSafe(created),
      })
      return created
    })
    response.status(201).json({ data: supervisor })
  })

  router.get('/operators', async (_request, response) => {
    const operators = await databaseProvider().operator.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: operatorSelect,
    })
    response.json({ data: operators })
  })

  router.post('/operators', async (request, response) => {
    const input = operatorSchema.parse(request.body)
    const operator = await databaseProvider().$transaction(async (transaction) => {
      const created = await transaction.operator.create({
        data: {
          login: input.login,
          name: input.name,
          admissionDate: toDate(input.admissionDate),
        },
        select: operatorSelect,
      })
      await createAuditEvent(transaction, {
        entityType: 'Operator',
        entityId: created.id,
        actorIdentifier: input.actorIdentifier,
        newValues: dateSafe(created),
      })
      return created
    })
    response.status(201).json({ data: operator })
  })

  router.patch('/operators/:id/status', async (request, response) => {
    const id = uuidSchema.parse(request.params.id)
    const input = operatorStatusSchema.parse(request.body)
    const operator = await databaseProvider().$transaction(async (transaction) => {
      const previous = await transaction.operator.findUnique({ where: { id }, select: operatorSelect })
      if (!previous) throw notFound('Operador')

      const updated = await transaction.operator.update({
        where: { id },
        data: {
          status: input.status,
          inactivatedAt: input.status === RecordStatus.INACTIVE ? new Date() : null,
        },
        select: operatorSelect,
      })
      await createAuditEvent(transaction, {
        entityType: 'Operator',
        entityId: updated.id,
        actorIdentifier: input.actorIdentifier,
        operation: AuditOperation.UPDATE,
        previousValues: dateSafe(previous),
        newValues: dateSafe(updated),
      })
      return updated
    })
    response.json({ data: operator })
  })

  router.get('/assignments', async (request, response) => {
    const query = assignmentQuerySchema.parse(request.query)
    const assignments = await databaseProvider().operatorAssignment.findMany({
      ...(query.operatorId ? { where: { operatorId: query.operatorId } } : {}),
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
      select: assignmentSelect,
    })
    response.json({ data: assignments })
  })

  router.post('/assignments', async (request, response) => {
    const input = assignmentSchema.parse(request.body)
    const validFrom = toDate(input.validFrom)
    const validTo = input.validTo ? toDate(input.validTo) : null
    validatePeriod(validFrom, validTo)

    const assignment = await databaseProvider().$transaction(async (transaction) => {
      await validateAssignmentReferences(transaction, input)
      await ensureAssignmentPeriodAvailable(transaction, input.operatorId, validFrom, validTo)

      const created = await transaction.operatorAssignment.create({
        data: {
          operatorId: input.operatorId,
          environmentId: input.environmentId,
          skuId: input.skuId,
          supervisorId: input.supervisorId,
          validFrom,
          validTo,
        },
        select: assignmentSelect,
      })
      await createAuditEvent(transaction, {
        environmentId: created.environmentId,
        entityType: 'OperatorAssignment',
        entityId: created.id,
        actorIdentifier: input.actorIdentifier,
        newValues: dateSafe(created),
      })
      return created
    })
    response.status(201).json({ data: assignment })
  })

  router.patch('/assignments/:id/period', async (request, response) => {
    const id = uuidSchema.parse(request.params.id)
    const input = assignmentPeriodSchema.parse(request.body)
    const assignment = await databaseProvider().$transaction(async (transaction) => {
      const previous = await transaction.operatorAssignment.findUnique({
        where: { id },
        select: assignmentSelect,
      })
      if (!previous) throw notFound('Atribuição')

      const validFrom = input.validFrom ? toDate(input.validFrom) : previous.validFrom
      const validTo = input.validTo === undefined
        ? previous.validTo
        : input.validTo === null
          ? null
          : toDate(input.validTo)
      validatePeriod(validFrom, validTo)
      await ensureAssignmentPeriodAvailable(transaction, previous.operatorId, validFrom, validTo, id)

      const updated = await transaction.operatorAssignment.update({
        where: { id },
        data: { validFrom, validTo },
        select: assignmentSelect,
      })
      await createAuditEvent(transaction, {
        environmentId: updated.environmentId,
        entityType: 'OperatorAssignment',
        entityId: updated.id,
        actorIdentifier: input.actorIdentifier,
        operation: AuditOperation.UPDATE,
        previousValues: dateSafe(previous),
        newValues: dateSafe(updated),
      })
      return updated
    })
    response.json({ data: assignment })
  })

  return router
}

const environmentSelect = {
  id: true,
  code: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EnvironmentSelect

const skuSelect = {
  id: true,
  environmentId: true,
  code: true,
  name: true,
  status: true,
  environment: { select: { id: true, name: true } },
} satisfies Prisma.SkuSelect

const supervisorSelect = {
  id: true,
  environmentId: true,
  name: true,
  status: true,
  environment: { select: { id: true, name: true } },
} satisfies Prisma.SupervisorSelect

const operatorSelect = {
  id: true,
  login: true,
  name: true,
  admissionDate: true,
  status: true,
  inactivatedAt: true,
} satisfies Prisma.OperatorSelect

const assignmentSelect = {
  id: true,
  operatorId: true,
  environmentId: true,
  skuId: true,
  supervisorId: true,
  validFrom: true,
  validTo: true,
  createdAt: true,
  operator: { select: { id: true, login: true, name: true } },
  environment: { select: { id: true, name: true } },
  sku: { select: { id: true, name: true } },
  supervisor: { select: { id: true, name: true } },
} satisfies Prisma.OperatorAssignmentSelect

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function validatePeriod(validFrom: Date, validTo: Date | null) {
  if (validTo && validTo < validFrom) {
    throw new AppError(
      'O fim da vigência não pode ser anterior ao início.',
      400,
      'INVALID_VALIDITY_PERIOD',
    )
  }
}

function notFound(entity: string) {
  return new AppError(`${entity} não encontrado.`, 404, 'RECORD_NOT_FOUND')
}

async function requireEnvironment(transaction: Prisma.TransactionClient, environmentId: string) {
  const environment = await transaction.environment.findUnique({
    where: { id: environmentId },
    select: { id: true },
  })
  if (!environment) throw notFound('Ambiente')
}

async function validateAssignmentReferences(
  transaction: Prisma.TransactionClient,
  input: z.infer<typeof assignmentSchema>,
) {
  const operator = await transaction.operator.findUnique({
    where: { id: input.operatorId },
    select: { id: true },
  })
  const environment = await transaction.environment.findUnique({
    where: { id: input.environmentId },
    select: { id: true },
  })
  const sku = await transaction.sku.findFirst({
    where: { id: input.skuId, environmentId: input.environmentId },
    select: { id: true },
  })
  const supervisor = await transaction.supervisor.findFirst({
    where: { id: input.supervisorId, environmentId: input.environmentId },
    select: { id: true },
  })

  if (!operator) throw notFound('Operador')
  if (!environment) throw notFound('Ambiente')
  if (!sku) {
    throw new AppError('O SKU não pertence ao ambiente informado.', 409, 'INVALID_SKU_ENVIRONMENT')
  }
  if (!supervisor) {
    throw new AppError(
      'O supervisor não pertence ao ambiente informado.',
      409,
      'INVALID_SUPERVISOR_ENVIRONMENT',
    )
  }
}

async function ensureAssignmentPeriodAvailable(
  transaction: Prisma.TransactionClient,
  operatorId: string,
  validFrom: Date,
  validTo: Date | null,
  ignoredId?: string,
) {
  const conflict = await transaction.operatorAssignment.findFirst({
    where: {
      operatorId,
      ...(ignoredId ? { id: { not: ignoredId } } : {}),
      validFrom: { lte: validTo ?? new Date('9999-12-31T00:00:00.000Z') },
      OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
    },
    select: { id: true },
  })

  if (conflict) {
    throw new AppError(
      'O operador já possui uma atribuição vigente nesse período.',
      409,
      'ASSIGNMENT_PERIOD_CONFLICT',
    )
  }
}

type AuditInput = {
  environmentId?: string
  entityType: string
  entityId: string
  actorIdentifier: string
  operation?: typeof AuditOperation[keyof typeof AuditOperation]
  previousValues?: Prisma.InputJsonValue
  newValues?: Prisma.InputJsonValue
}

async function createAuditEvent(transaction: Prisma.TransactionClient, input: AuditInput) {
  const data: Prisma.AuditEventUncheckedCreateInput = {
    ...(input.environmentId ? { environmentId: input.environmentId } : {}),
    operation: input.operation ?? AuditOperation.CREATE,
    entityType: input.entityType,
    entityId: input.entityId,
    actorKind: AuditActorKind.AUTHENTICATED,
    actorIdentifier: input.actorIdentifier,
    ...(input.previousValues === undefined ? {} : { previousValues: input.previousValues }),
    ...(input.newValues === undefined ? {} : { newValues: input.newValues }),
  }
  await transaction.auditEvent.create({
    data,
  })
}

function dateSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
