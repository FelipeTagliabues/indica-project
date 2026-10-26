import { authFetch } from '@/lib/auth-api'

export type IndicatorCode = 'NPS' | 'TMA_SECONDS' | 'CARD_RETENTION' | 'CALLBACK_RATE'

export type DailyResultRecord = {
  id: string
  assignmentId: string
  resultDate: string
  nps: number | null
  tmaSeconds: number | null
  cardRetention: number | null
  callbackRate: number | null
  version: number
  status: 'ACTIVE'
  createdAt: string
  updatedAt: string
  assignment: {
    operator: { id: string; login: string; name: string; admissionDate: string }
    environment: { id: string; name: string }
    sku: { id: string; name: string }
    supervisor: { id: string; name: string }
  }
}

export type IndicatorTargetRecord = {
  indicator: IndicatorCode
  value: number
  validFrom: string
  validTo: string | null
}

export type ResultFilters = {
  environmentId: string
  skuId: string
  dateFrom: string
  dateTo: string
  supervisorId?: string
  operatorId?: string
}

export type ResultInput = {
  assignmentId: string
  resultDate: string
  nps: number
  tmaSeconds: number
  cardRetention: number
  callbackRate: number
  actorIdentifier: string
}

type ResultsEnvelope = {
  data: DailyResultRecord[]
  meta: { targets: IndicatorTargetRecord[] }
}
type DataEnvelope<T> = { data: T }
type ErrorEnvelope = { error?: { message?: string; details?: Array<{ message: string }> } }

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export async function loadResults(filters: ResultFilters) {
  const query = new URLSearchParams(filters)
  const payload = await apiRequest<ResultsEnvelope>(`?${query.toString()}`)
  return { results: payload.data, targets: payload.meta.targets }
}

export function createResult(input: ResultInput) {
  return dataRequest<DailyResultRecord>('', { method: 'POST', body: JSON.stringify(input) })
}

export function updateResult(id: string, input: ResultInput & { version: number; confirmReplacement: true }) {
  return dataRequest<DailyResultRecord>(`/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

async function dataRequest<T>(path: string, init?: RequestInit) {
  const payload = await apiRequest<DataEnvelope<T>>(path, init)
  return payload.data
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${apiBaseUrl}/api/results${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const payload = await response.json().catch(() => null) as T | ErrorEnvelope | null
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined
    const details = error?.details?.map((item) => item.message).join(' ') ?? ''
    throw new Error([error?.message ?? 'Não foi possível concluir a operação.', details].filter(Boolean).join(' '))
  }
  if (!payload) throw new Error('A API retornou uma resposta inválida.')
  return payload as T
}

export function formatTma(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function parseTma(value: string) {
  const normalized = value.trim()
  if (!/^\d+(?::[0-5]\d)?$/.test(normalized)) return null
  const [minutesText, secondsText = '0'] = normalized.split(':')
  const minutes = Number(minutesText)
  const seconds = Number(secondsText)
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds)) return null
  return minutes * 60 + seconds
}
