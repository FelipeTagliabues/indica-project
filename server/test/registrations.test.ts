import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { createAuthenticatedTestApp as createApp } from './support/authenticated-test-app.js'

const environment = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'PERNAMBUCANAS',
  name: 'Pernambucanas',
  status: 'ACTIVE',
  createdAt: new Date('2026-10-24T12:00:00.000Z'),
  updatedAt: new Date('2026-10-24T12:00:00.000Z'),
}

function databaseWithTransaction(transaction: object) {
  return {
    $transaction: async (callback: (client: object) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient
}

describe('cadastros operacionais', () => {
  it('expõe as cinco listagens no prefixo /api/registrations mesmo sem registros', async () => {
    const findEnvironments = vi.fn().mockResolvedValue([])
    const findSkus = vi.fn().mockResolvedValue([])
    const findSupervisors = vi.fn().mockResolvedValue([])
    const findOperators = vi.fn().mockResolvedValue([])
    const findAssignments = vi.fn().mockResolvedValue([])
    const database = {
      environment: { findMany: findEnvironments },
      sku: { findMany: findSkus },
      supervisor: { findMany: findSupervisors },
      operator: { findMany: findOperators },
      operatorAssignment: { findMany: findAssignments },
    } as unknown as PrismaClient
    const app = createApp({ databaseProvider: () => database })

    const paths = [
      '/api/registrations/environments',
      '/api/registrations/skus',
      '/api/registrations/supervisors',
      '/api/registrations/operators',
      '/api/registrations/assignments',
    ]
    const responses = await Promise.all(paths.map((path) => request(app).get(path)))

    for (const response of responses) {
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ data: [] })
    }
    for (const findMany of [
      findEnvironments,
      findSkus,
      findSupervisors,
      findOperators,
      findAssignments,
    ]) {
      expect(findMany).toHaveBeenCalledOnce()
    }
  })

  it('informa claramente quando a persistência não está configurada', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const response = await request(createApp()).get('/api/registrations/environments')
      expect(response.status).toBe(503)
      expect(response.body.error.code).toBe('DATABASE_NOT_CONFIGURED')
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabaseUrl
    }
  })

  it('valida o payload antes de abrir uma transação', async () => {
    const databaseProvider = vi.fn(() => databaseWithTransaction({}))
    const app = createApp({ databaseProvider })

    const response = await request(app).post('/api/registrations/environments').send({})

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(databaseProvider).not.toHaveBeenCalled()
  })

  it('grava ambiente e auditoria na mesma transação', async () => {
    const createEnvironment = vi.fn().mockResolvedValue(environment)
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-id' })
    const database = databaseWithTransaction({
      environment: { create: createEnvironment },
      auditEvent: { create: createAudit },
    })
    const app = createApp({ databaseProvider: () => database })

    const response = await request(app).post('/api/registrations/environments').send({
      code: 'pernambucanas',
      name: 'Pernambucanas',
      actorIdentifier: 'Felipe (informado)',
    })

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({ code: 'PERNAMBUCANAS', name: 'Pernambucanas' })
    expect(createEnvironment).toHaveBeenCalledOnce()
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'CREATE',
        entityType: 'Environment',
        entityId: environment.id,
        actorKind: 'AUTHENTICATED',
        actorIdentifier: 'testes@indica.local',
      }),
    })
  })

  it('rejeita SKU que não pertence ao ambiente antes da gravação', async () => {
    const transaction = {
      operator: { findUnique: vi.fn().mockResolvedValue({ id: 'operator' }) },
      environment: { findUnique: vi.fn().mockResolvedValue({ id: 'environment' }) },
      sku: { findFirst: vi.fn().mockResolvedValue(null) },
      supervisor: { findFirst: vi.fn().mockResolvedValue({ id: 'supervisor' }) },
      operatorAssignment: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    }
    const app = createApp({
      databaseProvider: () => databaseWithTransaction(transaction),
    })

    const response = await request(app).post('/api/registrations/assignments').send({
      operatorId: '11111111-1111-4111-8111-111111111111',
      environmentId: '22222222-2222-4222-8222-222222222222',
      skuId: '33333333-3333-4333-8333-333333333333',
      supervisorId: '44444444-4444-4444-8444-444444444444',
      validFrom: '2026-10-01',
      validTo: null,
      actorIdentifier: 'Felipe (informado)',
    })

    expect(response.status).toBe(409)
    expect(response.body.error).toEqual({
      code: 'INVALID_SKU_ENVIRONMENT',
      message: 'O SKU não pertence ao ambiente informado.',
    })
    expect(transaction.operatorAssignment.create).not.toHaveBeenCalled()
  })

  it('rejeita conflito de vigência com mensagem de domínio', async () => {
    const transaction = {
      operator: { findUnique: vi.fn().mockResolvedValue({ id: 'operator' }) },
      environment: { findUnique: vi.fn().mockResolvedValue({ id: 'environment' }) },
      sku: { findFirst: vi.fn().mockResolvedValue({ id: 'sku' }) },
      supervisor: { findFirst: vi.fn().mockResolvedValue({ id: 'supervisor' }) },
      operatorAssignment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-assignment' }),
        create: vi.fn(),
      },
    }
    const app = createApp({
      databaseProvider: () => databaseWithTransaction(transaction),
    })

    const response = await request(app).post('/api/registrations/assignments').send({
      operatorId: '11111111-1111-4111-8111-111111111111',
      environmentId: '22222222-2222-4222-8222-222222222222',
      skuId: '33333333-3333-4333-8333-333333333333',
      supervisorId: '44444444-4444-4444-8444-444444444444',
      validFrom: '2026-10-01',
      actorIdentifier: 'Felipe (informado)',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('ASSIGNMENT_PERIOD_CONFLICT')
    expect(transaction.operatorAssignment.create).not.toHaveBeenCalled()
  })
})
