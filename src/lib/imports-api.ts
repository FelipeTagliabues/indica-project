export type ImportKind = 'OPERATORS' | 'RESULTS'
export type ImportStatus = 'PENDING' | 'VALIDATING' | 'COMPLETED' | 'FAILED'

export type ImportIssue = {
  lineNumber: number
  fieldName: string | null
  code: string
  message: string
  rawValues?: Record<string, string>
}

export type ImportPreview = {
  fingerprint: string
  type: ImportKind
  fileName: string
  totalRows: number
  validRows: number
  invalidRows: number
  issues: ImportIssue[]
  rows: Array<{
    lineNumber: number
    key: string
    action: 'CREATE' | 'UPDATE' | 'REPLACE' | 'UNCHANGED'
    summary: string
  }>
  requiresOperatorUpdateConfirmation: boolean
  requiresResultReplacementConfirmation: boolean
  scope: null | {
    environmentId: string
    environmentCode: string
    environmentName: string
    skuId: string | null
  }
}

export type ImportBatchRecord = {
  id: string
  type: ImportKind
  status: ImportStatus
  originalFileName: string
  totalRows: number
  acceptedRows: number
  rejectedRows: number
  actorIdentifier: string
  startedAt: string
  finishedAt: string | null
  environment: { id: string; code: string; name: string }
  sku: { id: string; code: string; name: string } | null
  errors: Array<ImportIssue & { id: string; createdAt: string }>
}

type ApiEnvelope = {
  data?: unknown
  error?: { message?: string; details?: Array<{ message: string }> }
}

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ImportApiError extends Error {
  readonly status: number
  readonly preview?: ImportPreview

  constructor(message: string, status: number, preview?: ImportPreview) {
    super(message)
    this.name = 'ImportApiError'
    this.status = status
    this.preview = preview
  }
}

export async function validateImport(file: File, type: ImportKind) {
  const form = new FormData()
  form.set('type', type)
  form.set('file', file)
  return request<ImportPreview>('/validate', { method: 'POST', body: form })
}

export async function commitValidatedImport(input: {
  file: File
  preview: ImportPreview
  actorIdentifier: string
  confirmOperatorUpdates: boolean
  confirmResultReplacements: boolean
}) {
  const form = new FormData()
  form.set('type', input.preview.type)
  form.set('file', input.file)
  form.set('fingerprint', input.preview.fingerprint)
  form.set('actorIdentifier', input.actorIdentifier)
  form.set('confirmOperatorUpdates', String(input.confirmOperatorUpdates))
  form.set('confirmResultReplacements', String(input.confirmResultReplacements))
  return request<ImportBatchRecord>('/commit', { method: 'POST', body: form })
}

export async function loadImportHistory() {
  return request<ImportBatchRecord[]>('')
}

export function importTemplateUrl(type: ImportKind, format: 'xlsx' | 'csv') {
  return `${apiBaseUrl}/api/imports/templates/${type.toLowerCase()}?format=${format}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/imports${path}`, init)
  const payload = await response.json().catch(() => null) as ApiEnvelope | null
  if (!response.ok) {
    const error = payload?.error
    const details = error?.details?.map((item) => item.message).join(' ') ?? ''
    const preview = payload?.data as ImportPreview | undefined
    throw new ImportApiError(
      [error?.message ?? 'Não foi possível concluir a importação.', details].filter(Boolean).join(' '),
      response.status,
      preview,
    )
  }
  if (!payload || payload.data === undefined) throw new ImportApiError('A API retornou uma resposta inválida.', response.status)
  return payload.data as T
}
