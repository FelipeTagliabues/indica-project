import { describe, expect, it } from 'vitest'
import { gerarOperadores, parseCsv, workspaces } from '@/lib/mock-data'

describe('dados do painel', () => {
  it('gera a mesma base demonstrativa para a mesma carteira', () => {
    const workspace = workspaces[0]!
    expect(gerarOperadores(workspace)).toEqual(gerarOperadores(workspace))
    expect(gerarOperadores(workspace)).toHaveLength(24)
  })

  it('interpreta o formato CSV documentado', () => {
    const csv = [
      'nome,supervisor,produto,mesesCasa,tma,conversao,nps,absenteismo,atendimentos',
      'Maria Silva,Ana Ribeiro,Seguro,3,310,19.5,74,3.2,520',
    ].join('\n')

    expect(parseCsv(csv, 'pernambucanas')).toEqual([
      {
        id: 'pernambucanas-up-0',
        nome: 'Maria Silva',
        supervisor: 'Ana Ribeiro',
        produto: 'Seguro',
        mesesCasa: 3,
        tma: 310,
        conversao: 19.5,
        nps: 74,
        absenteismo: 3.2,
        atendimentos: 520,
      },
    ])
  })
})
