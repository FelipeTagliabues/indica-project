import { authFetch } from '@/lib/auth-api'

export type RecordStatus = 'ACTIVE' | 'INACTIVE'

export type EnvironmentRecord = {
  id: string
  code: string
  name: string
  status: RecordStatus
}

export type SkuRecord = {
  id: string
  environmentId: string
  code: string
  name: string
  status: RecordStatus
  environment: Pick<EnvironmentRecord, 'id' | 'name'>
}

export type SupervisorRecord = {
  id: string
  environmentId: string
  name: string
  status: RecordStatus
  environment: Pick<EnvironmentRecord, 'id' | 'name'>
}

export type OperatorRecord = {
  id: string
  login: string
  name: string
  admissionDate: string
  status: RecordStatus
  inactivatedAt: string | null
}

export type AssignmentRecord = {
  id: string
  operatorId: string
  environmentId: string
  skuId: string
  supervisorId: string
  validFrom: string
  validTo: string | null
  operator: Pick<OperatorRecord, 'id' | 'login' | 'name'>
  environment: Pick<EnvironmentRecord, 'id' | 'name'>
  sku: Pick<SkuRecord, 'id' | 'name'>
  supervisor: Pick<SupervisorRecord, 'id' | 'name'>
}

export type RegistrationData = {
  environments: EnvironmentRecord[]
  skus: SkuRecord[]
  supervisors: SupervisorRecord[]
  operators: OperatorRecord[]
  assignments: AssignmentRecord[]
}

type ApiEnvelope<T> = { data: T }
type ApiErrorEnvelope = { error?: { message?: string; details?: Array<{ field: string; message: string }> } }

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class RegistrationApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'RegistrationApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${apiBaseUrl}/api/registrations${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | ApiErrorEnvelope | null

  if (!response.ok) {
    const error = payload && 'error' in payload ? payload.error : undefined
    const details = error?.details?.map((item) => item.message).join(' ') ?? ''
    throw new RegistrationApiError(
      [error?.message ?? 'Não foi possível concluir a operação.', details].filter(Boolean).join(' '),
      response.status,
    )
  }

  if (!payload || !('data' in payload)) {
    throw new RegistrationApiError('A API retornou uma resposta inválida.', response.status)
  }

  return payload.data
}

export async function loadRegistrationData(): Promise<RegistrationData> {
  const [environments, skus, supervisors, operators, assignments] = await Promise.all([
    request<EnvironmentRecord[]>('/environments'),
    request<SkuRecord[]>('/skus'),
    request<SupervisorRecord[]>('/supervisors'),
    request<OperatorRecord[]>('/operators'),
    request<AssignmentRecord[]>('/assignments'),
  ])

  return { environments, skus, supervisors, operators, assignments }
}

export const registrationsApi = {
  createEnvironment: (input: { code: string; name: string; actorIdentifier: string }) =>
    request<EnvironmentRecord>('/environments', { method: 'POST', body: JSON.stringify(input) }),
  createSku: (input: { environmentId: string; code: string; name: string; actorIdentifier: string }) =>
    request<SkuRecord>('/skus', { method: 'POST', body: JSON.stringify(input) }),
  createSupervisor: (input: { environmentId: string; name: string; actorIdentifier: string }) =>
    request<SupervisorRecord>('/supervisors', { method: 'POST', body: JSON.stringify(input) }),
  createOperator: (input: { login: string; name: string; admissionDate: string; actorIdentifier: string }) =>
    request<OperatorRecord>('/operators', { method: 'POST', body: JSON.stringify(input) }),
  changeOperatorStatus: (id: string, input: { status: RecordStatus; actorIdentifier: string }) =>
    request<OperatorRecord>(`/operators/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) }),
  createAssignment: (input: {
    operatorId: string
    environmentId: string
    skuId: string
    supervisorId: string
    validFrom: string
    validTo: string | null
    actorIdentifier: string
  }) => request<AssignmentRecord>('/assignments', { method: 'POST', body: JSON.stringify(input) }),
  changeAssignmentPeriod: (id: string, input: {
    validTo: string | null
    actorIdentifier: string
  }) => request<AssignmentRecord>(`/assignments/${id}/period`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
}
