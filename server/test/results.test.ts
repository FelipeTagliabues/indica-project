import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { createApp } from '../src/app.js'

const assignmentId = '11111111-1111-4111-8111-111111111111'
const resultId = '22222222-2222-4222-8222-222222222222'
const environmentId = '33333333-3333-4333-8333-333333333333'

function databaseWithTransaction(transaction: object) {
  return {
    $transaction: async (callback: (client: object) => Promise<unknown>) => callback(transaction),
  } as unknown as PrismaClient
}

const validPayload = {
  assignmentId,
  resultDate: '2026-10-24',
  nps: 72.5,
  tmaSeconds: 330,
  cardRetention: 18.25,
  callbackRate: 4.5,
  actorIdentifier: 'Responsável informado',
}

const persistedResult = {
  id: resultId,
  assignmentId,
  resultDate: new Date('2026-10-24T00:00:00.000Z'),
  nps: 72.5,
  tmaSeconds: 330,
  cardRetention: 18.25,
  callbackRate: 4.5,
  version: 1,
  status: 'ACTIVE',
  createdAt: new Date('2026-10-24T12:00:00.000Z'),
  updatedAt: new Date('2026-10-24T12:00:00.000Z'),
  assignment: {
    operator: {
      id: 'operator-id',
      login: 'operador',
      name: 'Operador Teste',
      admissionDate: new Date('2026-01-01T00:00:00.000Z'),
    },
    environment: { id: environmentId, name: 'Pernambucanas' },
    sku: { id: 'sku-id', name: 'Retenção' },
    supervisor: { id: 'supervisor-id', name: 'Supervisora Teste' },
  },
}

describe('resultados diários', () => {
  it('exige os quatro indicadores sem abrir transação', async () => {
    const databaseProvider = vi.fn(() => databaseWithTransaction({}))
    const app = createApp({ databaseProvider })

    const response = await request(app).post('/api/results').send({
      ...validPayload,
      callbackRate: undefined,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(databaseProvider).not.toHaveBeenCalled()
  })

  it('recusa percentuais com mais de duas casas decimais', async () => {
    const databaseProvider = vi.fn(() => databaseWithTransaction({}))
    const app = createApp({ databaseProvider })

    const response = await request(app).post('/api/results').send({
      ...validPayload,
      cardRetention: 18.257,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(databaseProvider).not.toHaveBeenCalled()
  })

  it('valida a atribuição na data operacional', async () => {
    const transaction = {
      operatorAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: assignmentId,
          environmentId,
          validFrom: new Date('2026-10-01T00:00:00.000Z'),
          validTo: new Date('2026-10-20T00:00:00.000Z'),
        }),
      },
    }
    const app = createApp({ databaseProvider: () => databaseWithTransaction(transaction) })

    const response = await request(app).post('/api/results').send(validPayload)

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('ASSIGNMENT_NOT_VALID_ON_DATE')
  })

  it('grava resultado completo e auditoria na mesma transação', async () => {
    const createResult = vi.fn().mockResolvedValue(persistedResult)
    const createAudit = vi.fn().mockResolvedValue({ id: 'audit-id' })
    const transaction = {
      operatorAssignment: {
        findUnique: vi.fn().mockResolvedValue({
          id: assignmentId,
          environmentId,
          validFrom: new Date('2026-10-01T00:00:00.000Z'),
          validTo: null,
        }),
      },
      dailyResult: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: createResult,
      },
      auditEvent: { create: createAudit },
    }
    const app = createApp({ databaseProvider: () => databaseWithTransaction(transaction) })

    const response = await request(app).post('/api/results').send(validPayload)

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      id: resultId,
      nps: 72.5,
      tmaSeconds: 330,
      cardRetention: 18.25,
      callbackRate: 4.5,
      version: 1,
    })
    expect(createResult).toHaveBeenCalledOnce()
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'CREATE',
        entityType: 'DailyResult',
        entityId: resultId,
        actorIdentifier: 'Responsável informado',
      }),
    })
  })

  it('exige confirmação explícita antes da substituição', async () => {
    const databaseProvider = vi.fn(() => databaseWithTransaction({}))
    const app = createApp({ databaseProvider })

    const response = await request(app).put(`/api/results/${resultId}`).send({
      ...validPayload,
      version: 1,
      confirmReplacement: false,
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(databaseProvider).not.toHaveBeenCalled()
  })
})
