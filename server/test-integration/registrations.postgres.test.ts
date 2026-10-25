import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { disconnectPrismaClient, getPrismaClient } from '../src/lib/prisma.js'

describe('cadastros com PostgreSQL exclusivo', () => {
  let database: PrismaClient
  let app: ReturnType<typeof createApp>
  const createdIds: string[] = []
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const actorIdentifier = `integration-test-${suffix}`

  beforeAll(async () => {
    requireSafeDatabaseTestConfiguration()
    database = getPrismaClient()
    const [context] = await database.$queryRaw<Array<{ database_name: string }>>`
      SELECT current_database() AS database_name
    `
    if (context?.database_name !== 'indica_dev') {
      await disconnectPrismaClient()
      throw new Error(
        `Execução recusada: a conexão resolveu para ${context?.database_name ?? 'um banco desconhecido'}, não para indica_dev.`,
      )
    }

    app = createApp({ databaseProvider: () => database })
  })

  afterAll(async () => {
    if (!database) return
    await database.dailyResult.deleteMany({ where: { assignmentId: { in: createdIds } } })
    await database.auditEvent.deleteMany({ where: { actorIdentifier } })
    await database.operatorAssignment.deleteMany({ where: { id: { in: createdIds } } })
    await database.operator.deleteMany({ where: { id: { in: createdIds } } })
    await database.supervisor.deleteMany({ where: { id: { in: createdIds } } })
    await database.sku.deleteMany({ where: { id: { in: createdIds } } })
    await database.environment.deleteMany({ where: { id: { in: createdIds } } })
    await disconnectPrismaClient()
  })

  it('persiste os cadastros e suas relações', async () => {
    const environment = await post('/environments', { code: `ENV_${suffix}`, name: `Ambiente ${suffix}` })
    const secondEnvironment = await post('/environments', { code: `ENV2_${suffix}`, name: `Ambiente 2 ${suffix}` })
    const sku = await post('/skus', { environmentId: environment.id, code: `SKU_${suffix}`, name: 'SKU integração' })
    const supervisor = await post('/supervisors', { environmentId: environment.id, name: `Supervisor ${suffix}` })
    const operator = await post('/operators', { login: `login-${suffix}`, name: `Operador ${suffix}`, admissionDate: '2026-01-15' })
    const assignment = await post('/assignments', {
      operatorId: operator.id,
      environmentId: environment.id,
      skuId: sku.id,
      supervisorId: supervisor.id,
      validFrom: '2026-01-15',
      validTo: null,
    })

    const listing = await request(app).get('/api/registrations/assignments').query({ operatorId: operator.id })
    expect(listing.status).toBe(200)
    expect(listing.body.data).toEqual([
      expect.objectContaining({
        id: assignment.id,
        environment: expect.objectContaining({ id: environment.id }),
        sku: expect.objectContaining({ id: sku.id }),
        supervisor: expect.objectContaining({ id: supervisor.id }),
      }),
    ])

    const invalidRelation = await request(app).post('/api/registrations/assignments').send({
      operatorId: operator.id,
      environmentId: secondEnvironment.id,
      skuId: sku.id,
      supervisorId: supervisor.id,
      validFrom: '2027-01-01',
      actorIdentifier,
    })
    expect(invalidRelation.status).toBe(409)
    expect(invalidRelation.body.error.code).toBe('INVALID_SKU_ENVIRONMENT')

    const overlap = await request(app).post('/api/registrations/assignments').send({
      operatorId: operator.id,
      environmentId: environment.id,
      skuId: sku.id,
      supervisorId: supervisor.id,
      validFrom: '2026-05-01',
      actorIdentifier,
    })
    expect(overlap.status).toBe(409)
    expect(overlap.body.error.code).toBe('ASSIGNMENT_PERIOD_CONFLICT')
  })

  it('impede login duplicado globalmente', async () => {
    const login = `duplicate-${suffix}`
    await post('/operators', { login, name: 'Primeiro operador', admissionDate: '2026-02-01' })
    const duplicate = await request(app).post('/api/registrations/operators').send({
      login,
      name: 'Segundo operador',
      admissionDate: '2026-02-02',
      actorIdentifier,
    })

    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('UNIQUE_CONFLICT')
  })

  it('valida gatilhos, versionamento e unicidade após cancelamento', async () => {
    const environment = await post('/environments', { code: `TRG_${suffix}`, name: `Gatilhos ${suffix}` })
    const sku = await post('/skus', { environmentId: environment.id, code: `TRGSKU_${suffix}`, name: 'SKU gatilhos' })
    const supervisor = await post('/supervisors', { environmentId: environment.id, name: `Supervisor gatilhos ${suffix}` })
    const operator = await post('/operators', { login: `trigger-${suffix}`, name: 'Operador gatilhos', admissionDate: '2026-03-01' })
    const assignment = await post('/assignments', {
      operatorId: operator.id,
      environmentId: environment.id,
      skuId: sku.id,
      supervisorId: supervisor.id,
      validFrom: '2026-03-01',
      validTo: '2026-03-31',
    })

    await expect(database.dailyResult.create({
      data: { assignmentId: assignment.id, resultDate: new Date('2026-04-01T00:00:00.000Z'), nps: 50 },
    })).rejects.toThrow()

    const result = await database.dailyResult.create({
      data: { assignmentId: assignment.id, resultDate: new Date('2026-03-10T00:00:00.000Z'), nps: 50 },
    })
    const cancelled = await database.dailyResult.update({
      where: { id: result.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: 'Cancelamento do teste de integração',
        cancelledBy: actorIdentifier,
      },
    })
    expect(cancelled.version).toBe(2)

    await expect(database.dailyResult.create({
      data: { assignmentId: assignment.id, resultDate: new Date('2026-03-10T00:00:00.000Z'), nps: 60 },
    })).rejects.toThrow()
  })

  it('cria, consulta e corrige os quatro indicadores com auditoria', async () => {
    const environment = await post('/environments', { code: `RES_${suffix}`, name: `Resultados ${suffix}` })
    const sku = await post('/skus', { environmentId: environment.id, code: `RESSKU_${suffix}`, name: 'SKU resultados' })
    const supervisor = await post('/supervisors', { environmentId: environment.id, name: `Supervisor resultados ${suffix}` })
    const operator = await post('/operators', { login: `result-${suffix}`, name: 'Operador resultados', admissionDate: '2026-04-01' })
    const assignment = await post('/assignments', {
      operatorId: operator.id,
      environmentId: environment.id,
      skuId: sku.id,
      supervisorId: supervisor.id,
      validFrom: '2026-04-01',
      validTo: '2026-04-30',
    })

    const outsideAssignment = await request(app).post('/api/results').send({
      assignmentId: assignment.id,
      resultDate: '2026-05-01',
      nps: 70,
      tmaSeconds: 300,
      cardRetention: 20,
      callbackRate: 5,
      actorIdentifier,
    })
    expect(outsideAssignment.status).toBe(409)
    expect(outsideAssignment.body.error.code).toBe('ASSIGNMENT_NOT_VALID_ON_DATE')

    const created = await request(app).post('/api/results').send({
      assignmentId: assignment.id,
      resultDate: '2026-04-15',
      nps: 70.25,
      tmaSeconds: 305,
      cardRetention: 20.5,
      callbackRate: 4.75,
      actorIdentifier,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data).toMatchObject({
      nps: 70.25,
      tmaSeconds: 305,
      cardRetention: 20.5,
      callbackRate: 4.75,
      version: 1,
    })

    const duplicate = await request(app).post('/api/results').send({
      assignmentId: assignment.id,
      resultDate: '2026-04-15',
      nps: 71,
      tmaSeconds: 300,
      cardRetention: 21,
      callbackRate: 4,
      actorIdentifier,
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('DAILY_RESULT_EXISTS')

    const listing = await request(app).get('/api/results').query({
      environmentId: environment.id,
      skuId: sku.id,
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    })
    expect(listing.status).toBe(200)
    expect(listing.body.data).toHaveLength(1)
    expect(listing.body.data[0].id).toBe(created.body.data.id)
    expect(listing.body.meta.targets).toEqual([])

    const correction = await request(app).put(`/api/results/${created.body.data.id}`).send({
      assignmentId: assignment.id,
      resultDate: '2026-04-15',
      nps: 75.5,
      tmaSeconds: 290,
      cardRetention: 22.75,
      callbackRate: 3.5,
      actorIdentifier,
      version: created.body.data.version,
      confirmReplacement: true,
    })
    expect(correction.status, JSON.stringify(correction.body)).toBe(200)
    expect(correction.body.data).toMatchObject({
      nps: 75.5,
      tmaSeconds: 290,
      cardRetention: 22.75,
      callbackRate: 3.5,
      version: 2,
    })

    const audit = await database.auditEvent.findFirst({
      where: {
        entityType: 'DailyResult',
        entityId: created.body.data.id,
        operation: 'CORRECTION',
        actorIdentifier,
      },
    })
    expect(audit?.previousValues).toBeTruthy()
    expect(audit?.newValues).toBeTruthy()
  })

  async function post(path: string, body: Record<string, unknown>) {
    const response = await request(app).post(`/api/registrations${path}`).send({ ...body, actorIdentifier })
    expect(response.status, JSON.stringify(response.body)).toBe(201)
    const record = response.body.data as { id: string }
    createdIds.push(record.id)
    return record as Record<string, string>
  }
})

function requireSafeDatabaseTestConfiguration() {
  if (process.env.INDICA_DATABASE_IS_EXCLUSIVE !== 'true') {
    throw new Error('Execução recusada: INDICA_DATABASE_IS_EXCLUSIVE precisa ser exatamente true.')
  }
  if (process.env.INDICA_ALLOW_EXCLUSIVE_DB_TESTS !== 'true') {
    throw new Error('Execução recusada: INDICA_ALLOW_EXCLUSIVE_DB_TESTS precisa ser exatamente true.')
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('Execução recusada: DATABASE_URL não foi carregada.')

  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new Error('Execução recusada: DATABASE_URL não é uma URL válida.')
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Execução recusada: DATABASE_URL não usa o protocolo PostgreSQL.')
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (databaseName !== 'indica_dev') {
    throw new Error(`Execução recusada: o banco na DATABASE_URL precisa ser indica_dev, não ${databaseName || 'vazio'}.`)
  }

  return databaseUrl
}
