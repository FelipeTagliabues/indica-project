import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { disconnectPrismaClient, getPrismaClient } from '../src/lib/prisma.js'

describe('importações com PostgreSQL exclusivo', () => {
  let database: PrismaClient
  let app: ReturnType<typeof createApp>
  let environmentId: string
  let skuId: string
  let supervisorId: string
  const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`
  const environmentCode = `IMP_${suffix}`.slice(0, 50).toUpperCase()
  const skuCode = `SKU_${suffix}`.slice(0, 50).toUpperCase()
  const supervisorName = `Supervisor importação ${suffix}`
  const login = `import-${suffix}`
  const rollbackLogin = `rollback-${suffix}`
  const actorIdentifier = `integration-import-${suffix}`

  beforeAll(async () => {
    requireSafeDatabaseTestConfiguration()
    database = getPrismaClient()
    const [context] = await database.$queryRaw<Array<{ database_name: string }>>`SELECT current_database() AS database_name`
    if (context?.database_name !== 'indica_dev') throw new Error('Execução recusada fora do banco indica_dev.')

    const environment = await database.environment.create({ data: { code: environmentCode, name: `Ambiente ${suffix}` } })
    environmentId = environment.id
    const sku = await database.sku.create({ data: { environmentId, code: skuCode, name: `SKU ${suffix}` } })
    skuId = sku.id
    const supervisor = await database.supervisor.create({ data: { environmentId, name: supervisorName } })
    supervisorId = supervisor.id
    app = createApp({ databaseProvider: () => database })
  })

  afterAll(async () => {
    if (!database) return
    const operators = await database.operator.findMany({ where: { login: { in: [login, rollbackLogin] } }, select: { id: true } })
    const operatorIds = operators.map((item) => item.id)
    const assignments = operatorIds.length === 0 ? [] : await database.operatorAssignment.findMany({ where: { operatorId: { in: operatorIds } }, select: { id: true } })
    await database.dailyResult.deleteMany({ where: { assignmentId: { in: assignments.map((item) => item.id) } } })
    await database.auditEvent.deleteMany({ where: { actorIdentifier } })
    await database.operatorAssignment.deleteMany({ where: { operatorId: { in: operatorIds } } })
    await database.operator.deleteMany({ where: { id: { in: operatorIds } } })
    await database.importBatch.deleteMany({ where: { environmentId } })
    await database.supervisor.deleteMany({ where: { id: supervisorId } })
    await database.sku.deleteMany({ where: { id: skuId } })
    await database.environment.deleteMany({ where: { id: environmentId } })
    await disconnectPrismaClient()
  })

  it('valida cabeçalhos, valores e duplicidades sem gravar lotes', async () => {
    const before = await database.importBatch.count({ where: { environmentId } })
    const wrongHeaders = await validate('OPERATORS', 'login;nome\nusuario;Nome\n')
    const invalidValues = await validate('RESULTS', [
      'ambiente_codigo;sku_codigo;login;data_resultado;nps;tma_minutos;retencao_cartao;rechamada',
      `${environmentCode};${skuCode};ausente;2026-02-30;200;4:99;-1;100.123`,
    ].join('\n'))
    const operatorHeader = 'ambiente_codigo;login;nome;data_admissao;sku_codigo;supervisor_nome;vigencia_inicio;vigencia_fim'
    const duplicatedRow = `${environmentCode};duplicado-${suffix};Duplicado;2026-01-01;${skuCode};${supervisorName};2026-01-01;`
    const duplicates = await validate('OPERATORS', `${operatorHeader}\n${duplicatedRow}\n${duplicatedRow}\n`)

    expect(wrongHeaders.body.data.issues.some((item: { code: string }) => item.code === 'MISSING_HEADER')).toBe(true)
    expect(invalidValues.body.data.issues.some((item: { code: string }) => item.code === 'INVALID_VALUE')).toBe(true)
    expect(duplicates.body.data.issues.filter((item: { code: string }) => item.code === 'LOGIN_VALIDITY_DUPLICATE')).toHaveLength(2)
    expect(await database.importBatch.count({ where: { environmentId } })).toBe(before)
  })

  it('importa operador e atribuição histórica somente após confirmação', async () => {
    const csv = [
      'ambiente_codigo;login;nome;data_admissao;sku_codigo;supervisor_nome;vigencia_inicio;vigencia_fim',
      `${environmentCode};${login};Operador importado;2026-01-01;${skuCode};${supervisorName};2026-01-01;2026-12-31`,
    ].join('\n')
    const preview = await validate('OPERATORS', csv)
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body.data.issues).toEqual([])

    const committed = await commit('OPERATORS', csv, preview.body.data.fingerprint)
    expect(committed.status, JSON.stringify(committed.body)).toBe(201)
    expect(committed.body.data).toMatchObject({ status: 'COMPLETED', totalRows: 1, acceptedRows: 1 })

    const operator = await database.operator.findUnique({ where: { login } })
    expect(operator?.name).toBe('Operador importado')
    const assignment = await database.operatorAssignment.findFirst({ where: { operatorId: operator!.id } })
    expect(assignment).toMatchObject({ environmentId, skuId, supervisorId })
    expect(await database.auditEvent.count({ where: { actorIdentifier, operation: 'IMPORT' } })).toBeGreaterThanOrEqual(2)

    const updateCsv = [
      'ambiente_codigo;login;nome;data_admissao;sku_codigo;supervisor_nome;vigencia_inicio;vigencia_fim',
      `${environmentCode};${login};Operador atualizado;2026-01-01;${skuCode};${supervisorName};2026-01-01;2026-12-31`,
    ].join('\n')
    const updatePreview = await validate('OPERATORS', updateCsv)
    expect(updatePreview.body.data.requiresOperatorUpdateConfirmation).toBe(true)
    const refused = await commit('OPERATORS', updateCsv, updatePreview.body.data.fingerprint)
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('OPERATOR_UPDATES_NOT_CONFIRMED')
    const confirmed = await commit('OPERATORS', updateCsv, updatePreview.body.data.fingerprint, { confirmOperatorUpdates: true })
    expect(confirmed.status).toBe(201)
    expect((await database.operator.findUniqueOrThrow({ where: { login } })).name).toBe('Operador atualizado')
  })

  it('importa resultado e exige confirmação para substituir os quatro indicadores', async () => {
    const header = 'ambiente_codigo;sku_codigo;login;data_resultado;nps;tma_minutos;retencao_cartao;rechamada'
    const initialCsv = `${header}\n${environmentCode};${skuCode};${login};2026-06-15;70.25;05:05;20.5;4.75\n`
    const initialPreview = await validate('RESULTS', initialCsv)
    expect(initialPreview.body.data.issues).toEqual([])
    expect((await commit('RESULTS', initialCsv, initialPreview.body.data.fingerprint)).status).toBe(201)

    const replacementCsv = `${header}\n${environmentCode};${skuCode};${login};2026-06-15;75.5;04:50;22.75;3.5\n`
    const replacementPreview = await validate('RESULTS', replacementCsv)
    expect(replacementPreview.body.data.requiresResultReplacementConfirmation).toBe(true)
    const refused = await commit('RESULTS', replacementCsv, replacementPreview.body.data.fingerprint)
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('RESULT_REPLACEMENTS_NOT_CONFIRMED')

    const confirmed = await commit('RESULTS', replacementCsv, replacementPreview.body.data.fingerprint, { confirmResultReplacements: true })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201)
    const operator = await database.operator.findUniqueOrThrow({ where: { login } })
    const assignment = await database.operatorAssignment.findFirstOrThrow({ where: { operatorId: operator.id } })
    const result = await database.dailyResult.findUniqueOrThrow({
      where: { assignmentId_resultDate: { assignmentId: assignment.id, resultDate: new Date('2026-06-15T00:00:00.000Z') } },
    })
    expect(Number(result.nps)).toBe(75.5)
    expect(result.tmaSeconds).toBe(290)
    expect(Number(result.cardRetention)).toBe(22.75)
    expect(Number(result.callbackRate)).toBe(3.5)
    expect(result.version).toBe(2)
    expect(await database.auditEvent.count({ where: { entityId: result.id, operation: 'CORRECTION', actorIdentifier } })).toBe(1)
  })

  it('reverte gravações operacionais quando ocorre falha dentro da transação', async () => {
    const failingApp = createApp({
      databaseProvider: () => database,
      importOptions: { afterFirstWrite: async () => { throw new Error('falha controlada do teste') } },
    })
    const csv = [
      'ambiente_codigo;login;nome;data_admissao;sku_codigo;supervisor_nome;vigencia_inicio;vigencia_fim',
      `${environmentCode};${rollbackLogin};Rollback;2026-02-01;${skuCode};${supervisorName};2026-02-01;2026-02-28`,
    ].join('\n')
    const preview = await request(failingApp).post('/api/imports/validate').field('type', 'OPERATORS').attach('file', Buffer.from(csv), { filename: 'rollback.csv' })
    const committed = await request(failingApp)
      .post('/api/imports/commit')
      .field('type', 'OPERATORS')
      .field('actorIdentifier', actorIdentifier)
      .field('fingerprint', preview.body.data.fingerprint)
      .field('confirmOperatorUpdates', 'false')
      .field('confirmResultReplacements', 'false')
      .attach('file', Buffer.from(csv), { filename: 'rollback.csv' })

    expect(committed.status).toBe(409)
    expect(committed.body.error.code).toBe('IMPORT_COMMIT_FAILED')
    expect(await database.operator.findUnique({ where: { login: rollbackLogin } })).toBeNull()
    const failedBatch = await database.importBatch.findFirst({
      where: { environmentId, originalFileName: 'rollback.csv', status: 'FAILED' },
      include: { errors: true },
    })
    expect(failedBatch?.acceptedRows).toBe(0)
    expect(failedBatch?.errors[0]?.code).toBe('TRANSACTION_ROLLBACK')
  })

  function validate(type: 'OPERATORS' | 'RESULTS', csv: string) {
    return request(app).post('/api/imports/validate').field('type', type).attach('file', Buffer.from(csv), { filename: `${type.toLowerCase()}.csv`, contentType: 'text/csv' })
  }

  function commit(
    type: 'OPERATORS' | 'RESULTS',
    csv: string,
    fingerprint: string,
    confirmations: { confirmOperatorUpdates?: boolean; confirmResultReplacements?: boolean } = {},
  ) {
    return request(app)
      .post('/api/imports/commit')
      .field('type', type)
      .field('actorIdentifier', actorIdentifier)
      .field('fingerprint', fingerprint)
      .field('confirmOperatorUpdates', String(confirmations.confirmOperatorUpdates ?? false))
      .field('confirmResultReplacements', String(confirmations.confirmResultReplacements ?? false))
      .attach('file', Buffer.from(csv), { filename: `${type.toLowerCase()}.csv`, contentType: 'text/csv' })
  }
})

function requireSafeDatabaseTestConfiguration() {
  if (process.env.INDICA_DATABASE_IS_EXCLUSIVE !== 'true') throw new Error('Execução recusada: INDICA_DATABASE_IS_EXCLUSIVE precisa ser true.')
  if (process.env.INDICA_ALLOW_EXCLUSIVE_DB_TESTS !== 'true') throw new Error('Execução recusada: INDICA_ALLOW_EXCLUSIVE_DB_TESTS precisa ser true.')
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('Execução recusada: DATABASE_URL não foi carregada.')
  const url = new URL(databaseUrl)
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (databaseName !== 'indica_dev') throw new Error(`Execução recusada para ${databaseName || 'banco desconhecido'}.`)
}
