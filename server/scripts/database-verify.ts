import 'dotenv/config'
import { Client } from 'pg'
import { z } from 'zod'

const configResult = z.object({
  DATABASE_URL: z.string({ error: 'Defina DATABASE_URL para o PostgreSQL novo e exclusivo de desenvolvimento.' }).url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'Use uma URL PostgreSQL.'),
  INDICA_DATABASE_IS_EXCLUSIVE: z.literal('true', {
    error: 'A verificação só pode ser executada no banco novo e exclusivo de desenvolvimento.',
  }),
}).safeParse(process.env)

if (!configResult.success) {
  console.error('Verificação bloqueada antes da conexão:')
  for (const issue of configResult.error.issues) console.error(`- ${issue.path.join('.')}: ${issue.message}`)
  process.exit(1)
}

const config = configResult.data

const expectedConstraints = [
  'operator_assignments_no_overlap',
  'indicator_targets_no_overlap',
  'operational_calendar_rules_no_overlap',
  'daily_results_values_check',
  'daily_results_has_value_check',
  'daily_results_cancellation_check',
  'users_identity_check',
  'users_confirmation_check',
  'users_session_version_check',
  'auth_tokens_dates_check',
  'user_sessions_dates_check',
  'user_sessions_version_check',
]
const expectedTriggers = [
  'daily_results_assignment_period_trigger',
  'operator_assignments_history_trigger',
  'daily_results_version_trigger',
]

const client = new Client({ connectionString: config.DATABASE_URL })

try {
  await client.connect()
  const database = await client.query<{ database_name: string }>('SELECT current_database() AS database_name')
  const migrations = await client.query<{ migration_name: string }>(`
    SELECT migration_name
      FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `)
  const extension = await client.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname = 'btree_gist'")
  const constraints = await client.query<{ conname: string }>(`
    SELECT conname
      FROM pg_constraint
     WHERE conname = ANY($1::text[])
  `, [expectedConstraints])
  const triggers = await client.query<{ tgname: string }>(`
    SELECT tgname
      FROM pg_trigger
     WHERE NOT tgisinternal AND tgname = ANY($1::text[])
  `, [expectedTriggers])

  const applied = new Set(migrations.rows.map((row) => row.migration_name))
  const foundConstraints = new Set(constraints.rows.map((row) => row.conname))
  const foundTriggers = new Set(triggers.rows.map((row) => row.tgname))
  const missingConstraints = expectedConstraints.filter((name) => !foundConstraints.has(name))
  const missingTriggers = expectedTriggers.filter((name) => !foundTriggers.has(name))

  if (!applied.has('20261024141000_initial_structure')) throw new Error('A migration inicial não consta como aplicada pelo Prisma.')
  if (!applied.has('20261025153000_user_authentication')) throw new Error('A migration de autenticação não consta como aplicada pelo Prisma.')
  if (extension.rowCount !== 1) throw new Error('A extensão btree_gist não está instalada.')
  if (missingConstraints.length) throw new Error(`Constraints ausentes: ${missingConstraints.join(', ')}.`)
  if (missingTriggers.length) throw new Error(`Gatilhos ausentes: ${missingTriggers.join(', ')}.`)

  console.log(JSON.stringify({
    database: database.rows[0]?.database_name,
    migrations: ['20261024141000_initial_structure', '20261025153000_user_authentication'],
    btreeGistInstalled: true,
    constraints: expectedConstraints,
    triggers: expectedTriggers,
  }, null, 2))
} finally {
  await client.end()
}
