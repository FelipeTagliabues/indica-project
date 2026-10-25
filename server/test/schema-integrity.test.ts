import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (path: string) => readFile(resolve(process.cwd(), path), 'utf8')

describe('integridade estrutural do modelo persistente', () => {
  it('mantém as relações compostas de ambiente no schema Prisma', async () => {
    const schema = await projectFile('prisma/schema.prisma')

    expect(schema).toContain('@@unique([id, environmentId])')
    expect(schema).toContain(
      '@relation(fields: [skuId, environmentId], references: [id, environmentId], onDelete: Restrict)',
    )
    expect(schema).toContain(
      '@relation(fields: [supervisorId, environmentId], references: [id, environmentId], onDelete: Restrict)',
    )
  })

  it('preserva a unicidade operacional mesmo para resultados cancelados', async () => {
    const schema = await projectFile('prisma/schema.prisma')
    const migration = await projectFile(
      'prisma/migrations/20261024141000_initial_structure/migration.sql',
    )

    expect(schema).toContain('@@unique([assignmentId, resultDate])')
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "daily_results_assignmentId_resultDate_key" ON "daily_results"("assignmentId", "resultDate");',
    )
    expect(migration).not.toMatch(
      /daily_results_assignmentId_resultDate_key[^;]+WHERE\s+"status"/s,
    )
  })

  it('mantém as garantias SQL que não são representáveis pelo Prisma', async () => {
    const migration = await projectFile(
      'prisma/migrations/20261024141000_initial_structure/migration.sql',
    )

    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS "btree_gist";')
    expect(migration).toContain('CONSTRAINT "operator_assignments_no_overlap"')
    expect(migration).toContain('CONSTRAINT "indicator_targets_no_overlap"')
    expect(migration).toContain('CONSTRAINT "operational_calendar_rules_no_overlap"')
    expect(migration).toContain('CREATE FUNCTION "validate_daily_result_assignment_period"()')
    expect(migration).toContain('CONSTRAINT = \'daily_results_import_batch_scope_check\'')
    expect(migration).toContain('CONSTRAINT = \'operator_assignments_history_identity_check\'')
    expect(migration).toContain('CREATE TRIGGER "daily_results_version_trigger"')
  })
})
