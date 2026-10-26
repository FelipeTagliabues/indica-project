import { createHash } from 'node:crypto'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {
  AuditActorKind,
  AuditOperation,
  ImportStatus,
  ImportType,
  ResultStatus,
  type Prisma,
  type PrismaClient,
} from '../generated/prisma/client.js'

export const importHeaders = {
  OPERATORS: [
    'ambiente_codigo',
    'login',
    'nome',
    'data_admissao',
    'sku_codigo',
    'supervisor_nome',
    'vigencia_inicio',
    'vigencia_fim',
  ],
  RESULTS: [
    'ambiente_codigo',
    'sku_codigo',
    'login',
    'data_resultado',
    'nps',
    'tma_minutos',
    'retencao_cartao',
    'rechamada',
  ],
} as const

export type ImportKind = keyof typeof importHeaders

export type ImportIssue = {
  lineNumber: number
  fieldName: string | null
  code: string
  message: string
  rawValues?: Record<string, string>
}

export type ImportPreviewRow = {
  lineNumber: number
  key: string
  action: 'CREATE' | 'UPDATE' | 'REPLACE' | 'UNCHANGED'
  summary: string
}

export type ImportPreview = {
  fingerprint: string
  type: ImportKind
  fileName: string
  totalRows: number
  validRows: number
  invalidRows: number
  issues: ImportIssue[]
  rows: ImportPreviewRow[]
  requiresOperatorUpdateConfirmation: boolean
  requiresResultReplacementConfirmation: boolean
  scope: null | {
    environmentId: string
    environmentCode: string
    environmentName: string
    skuId: string | null
  }
}

type RawRow = { lineNumber: number; values: Record<string, string> }

type OperatorRow = {
  lineNumber: number
  rawValues: Record<string, string>
  environmentId: string
  environmentCode: string
  login: string
  name: string
  admissionDate: Date
  skuId: string
  skuCode: string
  supervisorId: string
  supervisorName: string
  validFrom: Date
  validTo: Date | null
  operatorId: string | null
  operatorAction: 'CREATE' | 'UPDATE' | 'UNCHANGED'
  assignmentAction: 'CREATE' | 'UNCHANGED'
}

type ResultRow = {
  lineNumber: number
  rawValues: Record<string, string>
  environmentId: string
  environmentCode: string
  skuId: string
  skuCode: string
  assignmentId: string
  login: string
  resultDate: Date
  nps: number
  tmaSeconds: number
  cardRetention: number
  callbackRate: number
  existingResultId: string | null
  existingVersion: number | null
  action: 'CREATE' | 'REPLACE'
}

export type ValidatedImport = {
  preview: ImportPreview
  operators: OperatorRow[]
  results: ResultRow[]
}

type DatabaseClient = PrismaClient | Prisma.TransactionClient

export async function validateImportFile(
  database: DatabaseClient,
  type: ImportKind,
  fileName: string,
  buffer: Buffer,
): Promise<ValidatedImport> {
  const fingerprint = createHash('sha256').update(buffer).digest('hex')
  const parsed = await parseFile(type, fileName, buffer)
  const base = {
    fingerprint,
    type,
    fileName,
    totalRows: parsed.rows.length,
  }

  if (parsed.issues.length > 0 || parsed.rows.length === 0) {
    const issues = parsed.rows.length === 0 && parsed.issues.length === 0
      ? [issue(2, null, 'EMPTY_FILE', 'O arquivo não contém linhas para importar.')]
      : parsed.issues
    return {
      preview: previewFrom(base, issues, [], null),
      operators: [],
      results: [],
    }
  }

  return type === ImportType.OPERATORS
    ? validateOperators(database, base, parsed.rows)
    : validateResults(database, base, parsed.rows)
}

export async function commitImport(
  database: PrismaClient,
  validated: ValidatedImport,
  actorIdentifier: string,
  options: {
    confirmOperatorUpdates: boolean
    confirmResultReplacements: boolean
    afterFirstWrite?: () => Promise<void>
  },
) {
  const { preview } = validated
  if (preview.issues.length > 0 || !preview.scope) {
    throw new Error('A importação precisa estar válida antes da confirmação.')
  }

  return database.$transaction(async (transaction) => {
    const completedAt = new Date()
    const batch = await transaction.importBatch.create({
      data: {
        environmentId: preview.scope!.environmentId,
        skuId: preview.scope!.skuId,
        type: preview.type,
        status: ImportStatus.COMPLETED,
        originalFileName: preview.fileName,
        totalRows: preview.totalRows,
        acceptedRows: preview.totalRows,
        rejectedRows: 0,
        actorKind: AuditActorKind.AUTHENTICATED,
        actorIdentifier,
        startedAt: completedAt,
        finishedAt: completedAt,
        metadata: {
          fingerprint: preview.fingerprint,
          operatorUpdatesConfirmed: options.confirmOperatorUpdates,
          resultReplacementsConfirmed: options.confirmResultReplacements,
        },
      },
    })

    let writeCount = 0
    if (validated.operators.length > 0) {
      const grouped = groupBy(validated.operators, (row) => row.login)
      const operatorIds = new Map<string, string>()
      for (const [login, rows] of grouped) {
        const representative = rows[0]!
        let operatorId = representative.operatorId
        if (representative.operatorAction === 'CREATE') {
          const created = await transaction.operator.create({
            data: {
              login,
              name: representative.name,
              admissionDate: representative.admissionDate,
            },
          })
          operatorId = created.id
          await audit(transaction, {
            environmentId: representative.environmentId,
            entityType: 'Operator',
            entityId: created.id,
            actorIdentifier,
            newValues: jsonSafe(created),
            importBatchId: batch.id,
          })
          writeCount += 1
          if (writeCount === 1) await options.afterFirstWrite?.()
        } else if (representative.operatorAction === 'UPDATE') {
          if (!options.confirmOperatorUpdates) throw new Error('Atualizações de operadores não foram confirmadas.')
          const previous = await transaction.operator.findUniqueOrThrow({ where: { id: operatorId! } })
          const updated = await transaction.operator.update({
            where: { id: operatorId! },
            data: { name: representative.name, admissionDate: representative.admissionDate },
          })
          await audit(transaction, {
            environmentId: representative.environmentId,
            entityType: 'Operator',
            entityId: updated.id,
            actorIdentifier,
            previousValues: jsonSafe(previous),
            newValues: jsonSafe(updated),
            importBatchId: batch.id,
          })
          writeCount += 1
          if (writeCount === 1) await options.afterFirstWrite?.()
        }
        operatorIds.set(login, operatorId!)
      }

      for (const row of validated.operators) {
        if (row.assignmentAction === 'UNCHANGED') continue
        const created = await transaction.operatorAssignment.create({
          data: {
            operatorId: operatorIds.get(row.login)!,
            environmentId: row.environmentId,
            skuId: row.skuId,
            supervisorId: row.supervisorId,
            validFrom: row.validFrom,
            validTo: row.validTo,
          },
        })
        await audit(transaction, {
          environmentId: row.environmentId,
          entityType: 'OperatorAssignment',
          entityId: created.id,
          actorIdentifier,
          newValues: jsonSafe(created),
          importBatchId: batch.id,
        })
        writeCount += 1
        if (writeCount === 1) await options.afterFirstWrite?.()
      }
    }

    for (const row of validated.results) {
      if (row.action === 'CREATE') {
        const created = await transaction.dailyResult.create({
          data: resultData(row, batch.id),
        })
        await audit(transaction, {
          environmentId: row.environmentId,
          entityType: 'DailyResult',
          entityId: created.id,
          actorIdentifier,
          newValues: jsonSafe(created),
          importBatchId: batch.id,
        })
      } else {
        if (!options.confirmResultReplacements) throw new Error('Substituições de resultados não foram confirmadas.')
        const previous = await transaction.dailyResult.findUniqueOrThrow({ where: { id: row.existingResultId! } })
        const updatedCount = await transaction.dailyResult.updateMany({
          where: {
            id: row.existingResultId!,
            version: row.existingVersion!,
            status: ResultStatus.ACTIVE,
          },
          data: resultData(row, batch.id),
        })
        if (updatedCount.count !== 1) throw new Error('Um resultado foi alterado após a prévia.')
        const updated = await transaction.dailyResult.findUniqueOrThrow({ where: { id: row.existingResultId! } })
        await audit(transaction, {
          environmentId: row.environmentId,
          entityType: 'DailyResult',
          entityId: updated.id,
          actorIdentifier,
          operation: AuditOperation.CORRECTION,
          previousValues: jsonSafe(previous),
          newValues: jsonSafe(updated),
          importBatchId: batch.id,
        })
      }
      writeCount += 1
      if (writeCount === 1) await options.afterFirstWrite?.()
    }

    await audit(transaction, {
      environmentId: preview.scope!.environmentId,
      entityType: 'ImportBatch',
      entityId: batch.id,
      actorIdentifier,
      newValues: jsonSafe({
        type: batch.type,
        totalRows: batch.totalRows,
        acceptedRows: batch.acceptedRows,
        rejectedRows: batch.rejectedRows,
      }),
      importBatchId: batch.id,
    })

    return batch
  })
}

export async function recordFailedImport(
  database: PrismaClient,
  validated: ValidatedImport,
  actorIdentifier: string,
) {
  const { preview } = validated
  if (!preview.scope) return null
  return database.$transaction(async (transaction) => {
    const failedAt = new Date()
    return transaction.importBatch.create({ data: {
      environmentId: preview.scope!.environmentId,
      skuId: preview.scope!.skuId,
      type: preview.type,
      status: ImportStatus.FAILED,
      originalFileName: preview.fileName,
      totalRows: preview.totalRows,
      acceptedRows: 0,
      rejectedRows: preview.totalRows,
      actorKind: AuditActorKind.AUTHENTICATED,
      actorIdentifier,
      startedAt: failedAt,
      finishedAt: failedAt,
      metadata: { fingerprint: preview.fingerprint },
      errors: {
        create: preview.issues.slice(0, 500).map((item) => ({
          lineNumber: item.lineNumber,
          fieldName: item.fieldName,
          code: item.code,
          message: item.message,
          ...(item.rawValues ? { rawValues: item.rawValues } : {}),
        })),
      },
    } })
  })
}

export async function buildTemplate(type: ImportKind, format: 'csv' | 'xlsx') {
  const headers = [...importHeaders[type]]
  if (format === 'csv') {
    return Buffer.from(`\uFEFF${headers.join(';')}\r\n`, 'utf8')
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Indica'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet(type === 'OPERATORS' ? 'Operadores' : 'Resultados')
  worksheet.addRow(headers)
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.getRow(1).height = 24
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3578C6' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
  headers.forEach((header, index) => {
    worksheet.getColumn(index + 1).width = Math.max(16, header.length + 3)
  })
  const content = await workbook.xlsx.writeBuffer()
  return Buffer.from(content)
}

async function parseFile(type: ImportKind, fileName: string, buffer: Buffer) {
  const extension = path.extname(fileName).toLowerCase()
  let matrix: string[][]
  try {
    if (extension === '.csv') matrix = parseCsv(buffer.toString('utf8'))
    else if (extension === '.xlsx') matrix = await parseXlsx(buffer)
    else return { rows: [], issues: [issue(1, null, 'UNSUPPORTED_FILE', 'Use um arquivo .xlsx ou .csv.')] }
  } catch {
    return { rows: [], issues: [issue(1, null, 'INVALID_FILE', 'Não foi possível ler o arquivo. Confirme se ele é um Excel ou CSV válido.')] }
  }

  const nonEmpty = matrix.filter((row) => row.some((value) => value.trim() !== ''))
  if (nonEmpty.length === 0) return { rows: [], issues: [] }
  const actualHeaders = nonEmpty[0]!.map(canonicalHeader)
  const expectedHeaders = [...importHeaders[type]]
  const issues: ImportIssue[] = []
  for (const header of expectedHeaders) {
    if (!actualHeaders.includes(header)) issues.push(issue(1, header, 'MISSING_HEADER', `Cabeçalho obrigatório ausente: ${header}.`))
  }
  for (const header of actualHeaders) {
    if (!expectedHeaders.includes(header as never)) issues.push(issue(1, header || null, 'UNEXPECTED_HEADER', `Cabeçalho não reconhecido: ${header || '(vazio)'}.`))
  }
  if (new Set(actualHeaders).size !== actualHeaders.length) {
    issues.push(issue(1, null, 'DUPLICATE_HEADER', 'O arquivo contém cabeçalhos duplicados.'))
  }
  if (issues.length > 0) return { rows: [], issues }

  const rows = nonEmpty.slice(1).map((cells, index) => ({
    lineNumber: index + 2,
    values: Object.fromEntries(actualHeaders.map((header, column) => [header, cells[column]?.trim() ?? ''])),
  }))
  if (rows.length > 5_000) issues.push(issue(2, null, 'TOO_MANY_ROWS', 'O limite por arquivo é de 5.000 linhas.'))
  return { rows, issues }
}

async function validateOperators(
  database: DatabaseClient,
  base: { fingerprint: string; type: ImportKind; fileName: string; totalRows: number },
  rawRows: RawRow[],
): Promise<ValidatedImport> {
  const issues: ImportIssue[] = []
  const basicRows = rawRows.map((row) => {
    const values = row.values
    const environmentCode = required(values, 'ambiente_codigo', row, issues).toUpperCase()
    const login = required(values, 'login', row, issues)
    const name = required(values, 'nome', row, issues)
    const admissionDate = parseDate(values.data_admissao, 'data_admissao', row, issues)
    const skuCode = required(values, 'sku_codigo', row, issues).toUpperCase()
    const supervisorName = required(values, 'supervisor_nome', row, issues)
    const validFrom = parseDate(values.vigencia_inicio, 'vigencia_inicio', row, issues)
    const validTo = values.vigencia_fim ? parseDate(values.vigencia_fim, 'vigencia_fim', row, issues) : null
    if (validFrom && validTo && validTo < validFrom) {
      issues.push(issue(row.lineNumber, 'vigencia_fim', 'INVALID_PERIOD', 'O fim da vigência não pode ser anterior ao início.', values))
    }
    if (login.length > 100) issues.push(issue(row.lineNumber, 'login', 'VALUE_TOO_LONG', 'O login aceita no máximo 100 caracteres.', values))
    if (name.length > 160) issues.push(issue(row.lineNumber, 'nome', 'VALUE_TOO_LONG', 'O nome aceita no máximo 160 caracteres.', values))
    return { ...row, environmentCode, login, name, admissionDate, skuCode, supervisorName, validFrom, validTo }
  })

  addSingleEnvironmentIssue(basicRows, issues)
  addDuplicateIssues(basicRows, (row) => `${row.login}\u0000${dateKey(row.validFrom)}`, 'LOGIN_VALIDITY_DUPLICATE', issues)
  const byLogin = groupBy(basicRows, (row) => row.login)
  for (const rows of byLogin.values()) {
    const identity = new Set(rows.map((row) => `${row.name}\u0000${dateKey(row.admissionDate)}`))
    if (identity.size > 1) {
      for (const row of rows) issues.push(issue(row.lineNumber, 'login', 'OPERATOR_DATA_CONFLICT', 'O mesmo login possui nome ou data de admissão divergente no arquivo.', row.values))
    }
    addPeriodOverlapIssues(rows, issues)
  }

  if (issues.length > 0) return emptyValidated(base, issues)
  const environmentCode = basicRows[0]!.environmentCode
  const environment = await database.environment.findUnique({ where: { code: environmentCode } })
  if (!environment) {
    for (const row of basicRows) issues.push(issue(row.lineNumber, 'ambiente_codigo', 'ENVIRONMENT_NOT_FOUND', 'Ambiente não encontrado.', row.values))
    return emptyValidated(base, issues)
  }

  const skuCodes = unique(basicRows.map((row) => row.skuCode))
  const supervisorNames = unique(basicRows.map((row) => row.supervisorName))
  const logins = unique(basicRows.map((row) => row.login))
  const [skus, supervisors, operators] = await Promise.all([
    database.sku.findMany({ where: { environmentId: environment.id, code: { in: skuCodes } } }),
    database.supervisor.findMany({ where: { environmentId: environment.id, name: { in: supervisorNames } } }),
    database.operator.findMany({ where: { login: { in: logins } } }),
  ])
  const skuMap = new Map(skus.map((item) => [item.code, item]))
  const supervisorMap = groupBy(supervisors, (item) => item.name)
  const operatorMap = new Map(operators.map((item) => [item.login, item]))
  const existingAssignments = operators.length === 0 ? [] : await database.operatorAssignment.findMany({
    where: { operatorId: { in: operators.map((item) => item.id) } },
  })
  const assignmentsByOperator = groupBy(existingAssignments, (item) => item.operatorId)
  const rows: OperatorRow[] = []

  for (const row of basicRows) {
    const sku = skuMap.get(row.skuCode)
    const supervisorMatches = supervisorMap.get(row.supervisorName) ?? []
    const operator = operatorMap.get(row.login)
    if (!sku) issues.push(issue(row.lineNumber, 'sku_codigo', 'SKU_NOT_FOUND', 'SKU não encontrado no ambiente informado.', row.values))
    if (supervisorMatches.length === 0) issues.push(issue(row.lineNumber, 'supervisor_nome', 'SUPERVISOR_NOT_FOUND', 'Supervisor não encontrado no ambiente informado.', row.values))
    if (supervisorMatches.length > 1) issues.push(issue(row.lineNumber, 'supervisor_nome', 'SUPERVISOR_AMBIGUOUS', 'Há mais de um supervisor com esse nome no ambiente.', row.values))
    if (!sku || supervisorMatches.length !== 1 || !row.admissionDate || !row.validFrom) continue

    const operatorAction = !operator
      ? 'CREATE'
      : operator.name !== row.name || dateKey(operator.admissionDate) !== dateKey(row.admissionDate)
        ? 'UPDATE'
        : 'UNCHANGED'
    let assignmentAction: OperatorRow['assignmentAction'] = 'CREATE'
    if (operator) {
      const conflicts = (assignmentsByOperator.get(operator.id) ?? []).filter((item) => periodsOverlap(row.validFrom!, row.validTo, item.validFrom, item.validTo))
      const exact = conflicts.find((item) => item.validFrom.getTime() === row.validFrom!.getTime())
      if (exact && exact.environmentId === environment.id && exact.skuId === sku.id && exact.supervisorId === supervisorMatches[0]!.id && sameNullableDate(exact.validTo, row.validTo)) {
        assignmentAction = 'UNCHANGED'
      } else if (conflicts.length > 0) {
        issues.push(issue(row.lineNumber, 'vigencia_inicio', 'ASSIGNMENT_PERIOD_CONFLICT', 'A vigência conflita com uma atribuição já cadastrada para o operador.', row.values))
        continue
      }
    }
    rows.push({
      lineNumber: row.lineNumber,
      rawValues: row.values,
      environmentId: environment.id,
      environmentCode,
      login: row.login,
      name: row.name,
      admissionDate: row.admissionDate,
      skuId: sku.id,
      skuCode: sku.code,
      supervisorId: supervisorMatches[0]!.id,
      supervisorName: supervisorMatches[0]!.name,
      validFrom: row.validFrom,
      validTo: row.validTo,
      operatorId: operator?.id ?? null,
      operatorAction,
      assignmentAction,
    })
  }

  const previewRows: ImportPreviewRow[] = rows.map((row) => ({
    lineNumber: row.lineNumber,
    key: `${row.login} · ${dateKey(row.validFrom)}`,
    action: row.operatorAction === 'UPDATE' ? 'UPDATE' : row.operatorAction === 'CREATE' || row.assignmentAction === 'CREATE' ? 'CREATE' : 'UNCHANGED',
    summary: `${row.name} · ${row.skuCode} · ${row.supervisorName}`,
  }))
  const skuIds = unique(rows.map((row) => row.skuId))
  const scope = { environmentId: environment.id, environmentCode, environmentName: environment.name, skuId: skuIds.length === 1 ? skuIds[0]! : null }
  return {
    preview: previewFrom(base, issues, previewRows, scope),
    operators: issues.length === 0 ? rows : [],
    results: [],
  }
}

async function validateResults(
  database: DatabaseClient,
  base: { fingerprint: string; type: ImportKind; fileName: string; totalRows: number },
  rawRows: RawRow[],
): Promise<ValidatedImport> {
  const issues: ImportIssue[] = []
  const basicRows = rawRows.map((row) => {
    const values = row.values
    const environmentCode = required(values, 'ambiente_codigo', row, issues).toUpperCase()
    const skuCode = required(values, 'sku_codigo', row, issues).toUpperCase()
    const login = required(values, 'login', row, issues)
    const resultDate = parseDate(values.data_resultado, 'data_resultado', row, issues)
    const nps = parseMetric(values.nps, 'nps', row, issues, -100, 100)
    const tmaSeconds = parseTma(values.tma_minutos, row, issues)
    const cardRetention = parseMetric(values.retencao_cartao, 'retencao_cartao', row, issues, 0, 100)
    const callbackRate = parseMetric(values.rechamada, 'rechamada', row, issues, 0, 100)
    return { ...row, environmentCode, skuCode, login, resultDate, nps, tmaSeconds, cardRetention, callbackRate }
  })
  addSingleEnvironmentIssue(basicRows, issues)
  addDuplicateIssues(basicRows, (row) => `${row.login}\u0000${dateKey(row.resultDate)}`, 'DAILY_RESULT_DUPLICATE', issues)
  if (issues.length > 0) return emptyValidated(base, issues)

  const environmentCode = basicRows[0]!.environmentCode
  const environment = await database.environment.findUnique({ where: { code: environmentCode } })
  if (!environment) {
    for (const row of basicRows) issues.push(issue(row.lineNumber, 'ambiente_codigo', 'ENVIRONMENT_NOT_FOUND', 'Ambiente não encontrado.', row.values))
    return emptyValidated(base, issues)
  }
  const skuCodes = unique(basicRows.map((row) => row.skuCode))
  const logins = unique(basicRows.map((row) => row.login))
  const [skus, operators] = await Promise.all([
    database.sku.findMany({ where: { environmentId: environment.id, code: { in: skuCodes } } }),
    database.operator.findMany({ where: { login: { in: logins } } }),
  ])
  const skuMap = new Map(skus.map((item) => [item.code, item]))
  const operatorMap = new Map(operators.map((item) => [item.login, item]))
  const assignments = operators.length === 0 ? [] : await database.operatorAssignment.findMany({
    where: { operatorId: { in: operators.map((item) => item.id) }, environmentId: environment.id },
  })
  const assignmentsByOperator = groupBy(assignments, (item) => item.operatorId)
  const candidates: Array<Omit<ResultRow, 'existingResultId' | 'existingVersion' | 'action'>> = []
  for (const row of basicRows) {
    const sku = skuMap.get(row.skuCode)
    const operator = operatorMap.get(row.login)
    if (!sku) issues.push(issue(row.lineNumber, 'sku_codigo', 'SKU_NOT_FOUND', 'SKU não encontrado no ambiente informado.', row.values))
    if (!operator) issues.push(issue(row.lineNumber, 'login', 'OPERATOR_NOT_FOUND', 'Operador não encontrado.', row.values))
    if (!sku || !operator || !row.resultDate || row.nps === null || row.tmaSeconds === null || row.cardRetention === null || row.callbackRate === null) continue
    const assignment = (assignmentsByOperator.get(operator.id) ?? []).find((item) => (
      item.skuId === sku.id && item.validFrom <= row.resultDate! && (!item.validTo || item.validTo >= row.resultDate!)
    ))
    if (!assignment) {
      issues.push(issue(row.lineNumber, 'data_resultado', 'ASSIGNMENT_NOT_VALID_ON_DATE', 'Não há atribuição válida do operador para o ambiente, SKU e data informados.', row.values))
      continue
    }
    candidates.push({
      lineNumber: row.lineNumber,
      rawValues: row.values,
      environmentId: environment.id,
      environmentCode,
      skuId: sku.id,
      skuCode: sku.code,
      assignmentId: assignment.id,
      login: row.login,
      resultDate: row.resultDate,
      nps: row.nps,
      tmaSeconds: row.tmaSeconds,
      cardRetention: row.cardRetention,
      callbackRate: row.callbackRate,
    })
  }

  const existing = candidates.length === 0 ? [] : await database.dailyResult.findMany({
    where: { OR: candidates.map((row) => ({ assignmentId: row.assignmentId, resultDate: row.resultDate })) },
  })
  const existingMap = new Map(existing.map((item) => [`${item.assignmentId}\u0000${dateKey(item.resultDate)}`, item]))
  const rows: ResultRow[] = []
  for (const row of candidates) {
    const found = existingMap.get(`${row.assignmentId}\u0000${dateKey(row.resultDate)}`)
    if (found?.status === ResultStatus.CANCELLED) {
      issues.push(issue(row.lineNumber, 'data_resultado', 'RESULT_CANCELLED', 'O resultado existente está cancelado e não pode ser recriado pela importação.', row.rawValues))
      continue
    }
    rows.push({
      ...row,
      existingResultId: found?.id ?? null,
      existingVersion: found?.version ?? null,
      action: found ? 'REPLACE' : 'CREATE',
    })
  }

  const previewRows: ImportPreviewRow[] = rows.map((row) => ({
    lineNumber: row.lineNumber,
    key: `${row.login} · ${dateKey(row.resultDate)}`,
    action: row.action,
    summary: `${row.skuCode} · NPS ${row.nps} · TMA ${row.tmaSeconds}s`,
  }))
  const skuIds = unique(rows.map((row) => row.skuId))
  const scope = { environmentId: environment.id, environmentCode, environmentName: environment.name, skuId: skuIds.length === 1 ? skuIds[0]! : null }
  return {
    preview: previewFrom(base, issues, previewRows, scope),
    operators: [],
    results: issues.length === 0 ? rows : [],
  }
}

function previewFrom(
  base: { fingerprint: string; type: ImportKind; fileName: string; totalRows: number },
  issues: ImportIssue[],
  rows: ImportPreviewRow[],
  scope: ImportPreview['scope'],
): ImportPreview {
  const invalidRows = new Set(issues.filter((item) => item.lineNumber > 1).map((item) => item.lineNumber)).size
  return {
    ...base,
    validRows: issues.length === 0 ? base.totalRows : Math.max(0, base.totalRows - invalidRows),
    invalidRows,
    issues,
    rows,
    requiresOperatorUpdateConfirmation: rows.some((row) => row.action === 'UPDATE'),
    requiresResultReplacementConfirmation: rows.some((row) => row.action === 'REPLACE'),
    scope,
  }
}

function emptyValidated(
  base: { fingerprint: string; type: ImportKind; fileName: string; totalRows: number },
  issues: ImportIssue[],
): ValidatedImport {
  return { preview: previewFrom(base, issues, [], null), operators: [], results: [] }
}

function required(values: Record<string, string>, field: string, row: RawRow, issues: ImportIssue[]) {
  const value = values[field]?.trim() ?? ''
  if (!value) issues.push(issue(row.lineNumber, field, 'REQUIRED_FIELD', 'Campo obrigatório não informado.', values))
  return value
}

function parseDate(value: string | undefined, field: string, row: RawRow, issues: ImportIssue[]) {
  const text = required(row.values, field, row, issues)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    issues.push(issue(row.lineNumber, field, 'INVALID_DATE', 'Use uma data válida no formato AAAA-MM-DD.', row.values))
    return null
  }
  const date = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) {
    issues.push(issue(row.lineNumber, field, 'INVALID_DATE', 'Use uma data válida no formato AAAA-MM-DD.', row.values))
    return null
  }
  return date
}

function parseMetric(value: string | undefined, field: string, row: RawRow, issues: ImportIssue[], min: number, max: number) {
  const text = required(row.values, field, row, issues).replace(',', '.')
  const number = Number(text)
  if (!Number.isFinite(number) || number < min || number > max) {
    issues.push(issue(row.lineNumber, field, 'INVALID_VALUE', `Informe um número entre ${min} e ${max}.`, row.values))
    return null
  }
  if (Math.abs(number * 100 - Math.round(number * 100)) >= 1e-8) {
    issues.push(issue(row.lineNumber, field, 'DECIMAL_PRECISION', 'Use no máximo duas casas decimais.', row.values))
    return null
  }
  return number
}

function parseTma(value: string | undefined, row: RawRow, issues: ImportIssue[]) {
  const text = required(row.values, 'tma_minutos', row, issues).replace(',', '.')
  if (/^\d+:\d{1,2}$/.test(text)) {
    const [minutesText, secondsText] = text.split(':')
    const minutes = Number(minutesText)
    const seconds = Number(secondsText)
    if (seconds < 60) return minutes * 60 + seconds
  } else {
    const minutes = Number(text)
    const total = Math.round(minutes * 60)
    if (Number.isFinite(minutes) && minutes >= 0 && Math.abs(minutes * 60 - total) < 1e-8) return total
  }
  issues.push(issue(row.lineNumber, 'tma_minutos', 'INVALID_TMA', 'Informe TMA em minutos ou MM:SS, com precisão de segundos.', row.values))
  return null
}

function addSingleEnvironmentIssue(rows: Array<{ lineNumber: number; values: Record<string, string>; environmentCode: string }>, issues: ImportIssue[]) {
  const codes = unique(rows.map((row) => row.environmentCode).filter(Boolean))
  if (codes.length <= 1) return
  for (const row of rows) issues.push(issue(row.lineNumber, 'ambiente_codigo', 'MULTIPLE_ENVIRONMENTS', 'Cada arquivo deve conter um único ambiente.', row.values))
}

function addDuplicateIssues<T extends { lineNumber: number; values: Record<string, string> }>(
  rows: T[],
  key: (row: T) => string,
  code: string,
  issues: ImportIssue[],
) {
  const groups = groupBy(rows, key)
  for (const duplicated of groups.values()) {
    if (duplicated.length < 2) continue
    for (const row of duplicated) issues.push(issue(row.lineNumber, null, code, 'Há uma duplicidade operacional dentro do arquivo.', row.values))
  }
}

function addPeriodOverlapIssues(
  rows: Array<{ lineNumber: number; values: Record<string, string>; validFrom: Date | null; validTo: Date | null }>,
  issues: ImportIssue[],
) {
  const valid = rows.filter((row): row is typeof row & { validFrom: Date } => Boolean(row.validFrom))
  for (let left = 0; left < valid.length; left += 1) {
    for (let right = left + 1; right < valid.length; right += 1) {
      if (periodsOverlap(valid[left]!.validFrom, valid[left]!.validTo, valid[right]!.validFrom, valid[right]!.validTo)) {
        issues.push(issue(valid[left]!.lineNumber, 'vigencia_inicio', 'ASSIGNMENT_PERIOD_CONFLICT', 'As vigências do mesmo operador se sobrepõem dentro do arquivo.', valid[left]!.values))
        issues.push(issue(valid[right]!.lineNumber, 'vigencia_inicio', 'ASSIGNMENT_PERIOD_CONFLICT', 'As vigências do mesmo operador se sobrepõem dentro do arquivo.', valid[right]!.values))
      }
    }
  }
}

function resultData(row: ResultRow, importBatchId: string) {
  return {
    assignmentId: row.assignmentId,
    importBatchId,
    resultDate: row.resultDate,
    nps: row.nps,
    tmaSeconds: row.tmaSeconds,
    cardRetention: row.cardRetention,
    callbackRate: row.callbackRate,
  }
}

async function audit(transaction: Prisma.TransactionClient, input: {
  environmentId: string
  entityType: string
  entityId: string
  actorIdentifier: string
  operation?: typeof AuditOperation[keyof typeof AuditOperation]
  previousValues?: Prisma.InputJsonValue
  newValues: Prisma.InputJsonValue
  importBatchId: string
}) {
  await transaction.auditEvent.create({
    data: {
      environmentId: input.environmentId,
      operation: input.operation ?? AuditOperation.IMPORT,
      entityType: input.entityType,
      entityId: input.entityId,
      actorKind: AuditActorKind.AUTHENTICATED,
      actorIdentifier: input.actorIdentifier,
      ...(input.previousValues ? { previousValues: input.previousValues } : {}),
      newValues: input.newValues,
      metadata: { importBatchId: input.importBatchId },
    },
  })
}

async function parseXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  const content = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  await workbook.xlsx.load(content)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []
  const matrix: string[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = []
    for (let column = 1; column <= row.cellCount; column += 1) values.push(cellText(row.getCell(column).value))
    matrix.push(values)
  })
  return matrix
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue)
    if ('text' in value) return String(value.text)
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
  }
  return String(value)
}

function parseCsv(source: string) {
  const text = source.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const separator = firstLine.includes(';') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else quoted = !quoted
    } else if (character === separator && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else value += character
  }
  if (value || row.length > 0) {
    row.push(value)
    rows.push(row)
  }
  if (quoted) throw new Error('CSV com aspas não fechadas.')
  return rows
}

function canonicalHeader(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_')
}

function issue(lineNumber: number, fieldName: string | null, code: string, message: string, rawValues?: Record<string, string>): ImportIssue {
  return { lineNumber, fieldName, code, message, ...(rawValues ? { rawValues } : {}) }
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

function unique<T>(items: T[]) {
  return [...new Set(items)]
}

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : ''
}

function periodsOverlap(leftFrom: Date, leftTo: Date | null, rightFrom: Date, rightTo: Date | null) {
  const infinity = new Date('9999-12-31T00:00:00.000Z')
  return leftFrom <= (rightTo ?? infinity) && rightFrom <= (leftTo ?? infinity)
}

function sameNullableDate(left: Date | null, right: Date | null) {
  return left === null ? right === null : right !== null && left.getTime() === right.getTime()
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
