import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

describe('API health check', () => {
  const app = createApp()

  it('informa que a API está ativa sem afirmar conexão com o banco', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'indica-api',
      database: 'not_checked',
    })
    expect(response.body.timestamp).toEqual(expect.any(String))
  })

  it('usa o tratamento centralizado para rotas inexistentes', async () => {
    const response = await request(app).get('/api/inexistente')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Rota não encontrada: GET /api/inexistente',
      },
    })
  })
})
