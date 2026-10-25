export type Operator = {
  id: string
  nome: string
  supervisor: string
  produto: string
  mesesCasa: number
  tma: number
  conversao: number
  nps: number
  absenteismo: number
  atendimentos: number
}

export type NumericOperatorKey = 'tma' | 'conversao' | 'nps' | 'absenteismo' | 'atendimentos'

export type Workspace = {
  id: string
  nome: string
  segmento: string
  indicadores: {
    key: NumericOperatorKey
    label: string
    sufixo: string
    meta: number
    maiorMelhor: boolean
  }[]
  supervisores: string[]
  produtos: string[]
}

export const workspaces: Workspace[] = [
  {
    id: 'pernambucanas',
    nome: 'Pernambucanas',
    segmento: 'Varejo · Cartões',
    indicadores: [
      { key: 'conversao', label: 'Conversão', sufixo: '%', meta: 18, maiorMelhor: true },
      { key: 'tma', label: 'TMA', sufixo: 's', meta: 320, maiorMelhor: false },
      { key: 'nps', label: 'NPS', sufixo: '', meta: 70, maiorMelhor: true },
      { key: 'absenteismo', label: 'Absenteísmo', sufixo: '%', meta: 5, maiorMelhor: false },
    ],
    supervisores: ['Ana Ribeiro', 'Carlos Lima', 'Juliana Prado'],
    produtos: ['Cartão Private', 'Seguro', 'Empréstimo'],
  },
  {
    id: 'nubank',
    nome: 'Nubank',
    segmento: 'Banco digital · Cobrança',
    indicadores: [
      { key: 'conversao', label: 'Recuperação', sufixo: '%', meta: 25, maiorMelhor: true },
      { key: 'tma', label: 'TMA', sufixo: 's', meta: 280, maiorMelhor: false },
      { key: 'nps', label: 'CSAT', sufixo: '', meta: 80, maiorMelhor: true },
      { key: 'absenteismo', label: 'Absenteísmo', sufixo: '%', meta: 4, maiorMelhor: false },
    ],
    supervisores: ['Marcos Teles', 'Patrícia Souza'],
    produtos: ['Acordo à vista', 'Parcelamento', 'Renegociação'],
  },
]

const nomes = [
  'Lucas', 'Mariana', 'Pedro', 'Beatriz', 'Rafael', 'Camila', 'Bruno', 'Larissa',
  'Diego', 'Fernanda', 'Thiago', 'Aline', 'Gustavo', 'Natália', 'Felipe', 'Renata',
  'André', 'Paula', 'Vitor', 'Jéssica', 'Igor', 'Bianca', 'Caio', 'Letícia',
]

function rand(seed: number) {
  const value = Math.sin(seed) * 10000
  return value - Math.floor(value)
}

export function gerarOperadores(workspace: Workspace): Operator[] {
  return nomes.map((nome, index) => {
    const random = (key: number) => rand(index * 13 + key + workspace.id.length * 7)
    const mesesCasa = Math.ceil(random(1) * 14)
    const experiencia = Math.min(mesesCasa / 6, 1)

    return {
      id: `${workspace.id}-${index}`,
      nome: `${nome} ${String.fromCharCode(65 + (index % 20))}.`,
      supervisor: workspace.supervisores[index % workspace.supervisores.length] ?? '',
      produto: workspace.produtos[Math.floor(random(2) * workspace.produtos.length)] ?? '',
      mesesCasa,
      tma: Math.round(420 - experiencia * 140 + random(3) * 60),
      conversao: +(10 + experiencia * 12 + random(4) * 8).toFixed(1),
      nps: Math.round(55 + experiencia * 20 + random(5) * 15),
      absenteismo: +(2 + random(6) * 7).toFixed(1),
      atendimentos: Math.round(300 + random(7) * 500),
    }
  })
}

export const faixas = [
  { id: 'todas', label: 'Todos', min: 0, max: 999 },
  { id: '1', label: 'Até 1 mês', min: 0, max: 1 },
  { id: '2', label: 'Até 2 meses', min: 0, max: 2 },
  { id: '3', label: 'Até 3 meses', min: 0, max: 3 },
  { id: '6', label: '3 a 6 meses', min: 4, max: 6 },
  { id: '6+', label: '+6 meses', min: 7, max: 999 },
]

export const evolucao = ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'].map((mes, index) => ({
  mes,
  conversao: +(14 + index * 1.2 + rand(index) * 2).toFixed(1),
  nps: Math.round(62 + index * 2 + rand(index + 9) * 4),
}))

/** Lê CSV simples: nome,supervisor,produto,mesesCasa,tma,conversao,nps,absenteismo,atendimentos. */
export function parseCsv(text: string, workspaceId: string): Operator[] {
  const linhas = text.trim().split(/\r?\n/).slice(1)

  return linhas
    .map((linha, index) => {
      const coluna = linha.split(/[;,]/).map((valor) => valor.trim())
      return {
        id: `${workspaceId}-up-${index}`,
        nome: coluna[0] ?? '',
        supervisor: coluna[1] ?? '',
        produto: coluna[2] ?? '',
        mesesCasa: Number(coluna[3]),
        tma: Number(coluna[4]),
        conversao: Number(coluna[5]),
        nps: Number(coluna[6]),
        absenteismo: Number(coluna[7]),
        atendimentos: Number(coluna[8]),
      }
    })
    .filter((operator) => operator.nome)
}
