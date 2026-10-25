import { createHash } from 'node:crypto'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import { ImportType, type PrismaClient } from '../generated/prisma/client.js'
import { getPrismaClient } from '../lib/prisma.js'
import {
  buildTemplate,
  commitImport,
  recordFailedImport,
  validateImportFile,
  type ValidatedImport,
} from '../services/import-service.js'

type DatabaseProvider = () => PrismaClient

export type ImportRouteOptions = {
  afterFirstWrite?: () => Promise<void>
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})

const typeSchema = z.enum([ImportType.OPERATORS, ImportType.RESULTS])
const actorSchema = z.string().trim().min(3, 'Informe o responsável pela importação.').max(160)
const booleanField = z.preprocess((value) => value === true || value === 'true', z.boolean())
const validateSchema = z.object({ type: typeSchema })
const commitSchema = z.object({
  type: typeSchema,
  actorIdentifier: actorSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/, 'A prévia informada é inválida.'),
  confirmOperatorUpdates: booleanField.default(false),
  confirmResultReplacements: booleanField.default(false),
})
const historyQuerySchema = z.object({
  environmentId: z.string().uuid().optional(),
  type: typeSchema.optional(),
})

export function createImportsRouter(
  databaseProvider: DatabaseProvider = getPrismaClient,
  options: ImportRouteOptions = {},
) {
  const router = Router()

  router.get('/templates/:type', async (request, response) => {
    const type = typeSchema.parse(String(request.params.type).toUpperCase())
    const format = z.enum(['csv', 'xlsx']).parse(request.query.format ?? 'xlsx')
    const content = await buildTemplate(type, format)
    const baseName = type === ImportType.OPERATORS ? 'modelo-operadores' : 'modelo-resultados'
    response
      .status(200)
      .set({
        'content-type': format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${baseName}.${format}"`,
        'content-length': String(content.length),
      })
      .send(content)
  })

  router.get('/', async (request, response) => {
    const query = historyQuerySchema.parse(request.query)
    const batches = await databaseProvider().importBatch.findMany({
      where: {
        ...(query.environmentId ? { environmentId: query.environmentId } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: {
        environment: { select: { id: true, code: true, name: true } },
        sku: { select: { id: true, code: true, name: true } },
        errors: { orderBy: [{ lineNumber: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    response.json({ data: batches })
  })

  router.post('/validate', upload.single('file'), async (request, response) => {
    const input = validateSchema.parse(request.body)
    const file = requireFile(request.file)
    const validated = await validateImportFile(databaseProvider(), input.type, file.originalname, file.buffer)
    response.json({ data: validated.preview })
  })

  router.post('/commit', upload.single('file'), async (request, response) => {
    const input = commitSchema.parse(request.body)
    const file = requireFile(request.file)
    const actualFingerprint = createHash('sha256').update(file.buffer).digest('hex')
    if (actualFingerprint !== input.fingerprint) {
      throw new AppError('O arquivo foi alterado depois da prévia. Valide-o novamente.', 409, 'IMPORT_FILE_CHANGED')
    }

    const database = databaseProvider()
    const validated = await validateImportFile(database, input.type, file.originalname, file.buffer)
    if (validated.preview.issues.length > 0) {
      const failedBatch = await recordFailedImport(database, validated, input.actorIdentifier)
      response.status(422).json({
        error: { code: 'IMPORT_VALIDATION_FAILED', message: 'O arquivo deixou de ser válido antes da gravação.' },
        data: validated.preview,
        ...(failedBatch ? { batchId: failedBatch.id } : {}),
      })
      return
    }
    if (validated.preview.requiresOperatorUpdateConfirmation && !input.confirmOperatorUpdates) {
      throw new AppError('Confirme explicitamente as atualizações de operadores.', 409, 'OPERATOR_UPDATES_NOT_CONFIRMED')
    }
    if (validated.preview.requiresResultReplacementConfirmation && !input.confirmResultReplacements) {
      throw new AppError('Confirme explicitamente a substituição dos resultados existentes.', 409, 'RESULT_REPLACEMENTS_NOT_CONFIRMED')
    }

    try {
      const batch = await commitImport(database, validated, input.actorIdentifier, {
        confirmOperatorUpdates: input.confirmOperatorUpdates,
        confirmResultReplacements: input.confirmResultReplacements,
        ...(options.afterFirstWrite ? { afterFirstWrite: options.afterFirstWrite } : {}),
      })
      response.status(201).json({ data: batch })
    } catch (cause) {
      const failed = withCommitFailure(validated, cause)
      await recordFailedImport(database, failed, input.actorIdentifier).catch(() => null)
      throw new AppError(
        'A importação falhou e nenhuma alteração operacional parcial foi mantida.',
        409,
        'IMPORT_COMMIT_FAILED',
      )
    }
  })

  return router
}

function requireFile(file: Express.Multer.File | undefined) {
  if (!file) throw new AppError('Selecione um arquivo .xlsx ou .csv.', 400, 'IMPORT_FILE_REQUIRED')
  return file
}

function withCommitFailure(validated: ValidatedImport, cause: unknown): ValidatedImport {
  const message = cause instanceof Error ? cause.message : 'Falha transacional não identificada.'
  return {
    ...validated,
    preview: {
      ...validated.preview,
      validRows: 0,
      invalidRows: validated.preview.totalRows,
      issues: [{
        lineNumber: 1,
        fieldName: null,
        code: 'TRANSACTION_ROLLBACK',
        message: `O lote foi revertido: ${message}`.slice(0, 500),
      }],
    },
  }
}
