import request from 'supertest'
import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { createAuthenticatedTestApp as createApp } from './support/authenticated-test-app.js'

describe('validação HTTP de importações', () => {
  it('rejeita cabeçalhos incorretos antes de consultar o banco', async () => {
    const databaseProvider = vi.fn(() => ({} as PrismaClient))
    const response = await upload(createApp({ databaseProvider }), 'OPERATORS', 'login;nome\noperador;Nome\n')

    expect(response.status).toBe(200)
    expect(response.body.data.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_HEADER', fieldName: 'ambiente_codigo' }),
      expect.objectContaining({ code: 'MISSING_HEADER', fieldName: 'vigencia_inicio' }),
    ]))
    expect(databaseProvider).toHaveBeenCalledOnce()
  })

  it('lista valores inválidos por linha e coluna sem gravar', async () => {
    const response = await upload(createApp({ databaseProvider: () => ({} as PrismaClient) }), 'RESULTS', [
      'ambiente_codigo;sku_codigo;login;data_resultado;nps;tma_minutos;retencao_cartao;rechamada',
      'ENV;SKU;login;2026-02-30;101;3:75;50.123;-1',
    ].join('\n'))

    expect(response.status).toBe(200)
    expect(response.body.data.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ lineNumber: 2, fieldName: 'data_resultado', code: 'INVALID_DATE' }),
      expect.objectContaining({ lineNumber: 2, fieldName: 'nps', code: 'INVALID_VALUE' }),
      expect.objectContaining({ lineNumber: 2, fieldName: 'tma_minutos', code: 'INVALID_TMA' }),
      expect.objectContaining({ lineNumber: 2, fieldName: 'retencao_cartao', code: 'DECIMAL_PRECISION' }),
      expect.objectContaining({ lineNumber: 2, fieldName: 'rechamada', code: 'INVALID_VALUE' }),
    ]))
  })

  it('bloqueia duplicidades operacionais dentro do arquivo inteiro', async () => {
    const header = 'ambiente_codigo;login;nome;data_admissao;sku_codigo;supervisor_nome;vigencia_inicio;vigencia_fim'
    const row = 'ENV;login;Nome;2026-01-01;SKU;Supervisor;2026-01-01;'
    const response = await upload(createApp({ databaseProvider: () => ({} as PrismaClient) }), 'OPERATORS', `${header}\n${row}\n${row}\n`)

    expect(response.status).toBe(200)
    expect(response.body.data.issues.filter((item: { code: string }) => item.code === 'LOGIN_VALIDITY_DUPLICATE')).toHaveLength(2)
  })

  it('entrega modelos oficiais CSV e Excel', async () => {
    const app = createApp({ databaseProvider: () => ({} as PrismaClient) })
    const csv = await request(app).get('/api/imports/templates/operators?format=csv')
    const excel = await request(app).get('/api/imports/templates/results?format=xlsx').buffer(true).parse(binaryParser)

    expect(csv.status).toBe(200)
    expect(csv.text).toContain('ambiente_codigo;login;nome')
    expect(excel.status).toBe(200)
    expect(excel.headers['content-disposition']).toContain('modelo-resultados.xlsx')
    expect((excel.body as Buffer).subarray(0, 2).toString()).toBe('PK')
  })

  it('lê arquivos Excel pelo mesmo pipeline de validação', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Resultados')
    sheet.addRow(['ambiente_codigo', 'sku_codigo', 'login', 'data_resultado', 'nps', 'tma_minutos', 'retencao_cartao', 'rechamada'])
    sheet.addRow(['ENV', 'SKU', 'login', 'data-inválida', 70, '05:00', 20, 5])
    const content = Buffer.from(await workbook.xlsx.writeBuffer())

    const response = await request(createApp({ databaseProvider: () => ({} as PrismaClient) }))
      .post('/api/imports/validate')
      .field('type', 'RESULTS')
      .attach('file', content, { filename: 'resultados.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    expect(response.status).toBe(200)
    expect(response.body.data.issues).toContainEqual(expect.objectContaining({ fieldName: 'data_resultado', code: 'INVALID_DATE' }))
  })
})

function upload(app: ReturnType<typeof createApp>, type: 'OPERATORS' | 'RESULTS', csv: string) {
  return request(app)
    .post('/api/imports/validate')
    .field('type', type)
    .attach('file', Buffer.from(csv), { filename: 'importacao.csv', contentType: 'text/csv' })
}

function binaryParser(response: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = []
  response.on('data', (chunk: Buffer) => chunks.push(chunk))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
  response.on('error', callback)
}
