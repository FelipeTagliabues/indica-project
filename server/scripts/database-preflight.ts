import 'dotenv/config'
import { Client } from 'pg'
import { z } from 'zod'

const configResult = z.object({
  DATABASE_URL: z.string({ error: 'Defina DATABASE_URL para o PostgreSQL novo e exclusivo de desenvolvimento.' }).url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'Use uma URL PostgreSQL.'),
  INDICA_DATABASE_IS_EXCLUSIVE: z.literal('true', {
    error: 'Defina INDICA_DATABASE_IS_EXCLUSIVE=true somente após confirmar que o banco é novo e exclusivo do Indica em desenvolvimento.',
  }),
}).safeParse(process.env)

if (!configResult.success) {
  console.error('Preflight bloqueado antes da conexão:')
  for (const issue of configResult.error.issues) console.error(`- ${issue.path.join('.')}: ${issue.message}`)
  process.exit(1)
}

const config = configResult.data

const client = new Client({ connectionString: config.DATABASE_URL })

try {
  await client.connect()
  const context = await client.query<{
    database_name: string
    user_name: string
    can_create_database_objects: boolean
    can_use_public_schema: boolean
    can_create_public_objects: boolean
  }>(`
    SELECT
      current_database() AS database_name,
      current_user AS user_name,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects,
      has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public_schema,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_objects
  `)
  const extension = await client.query<{ name: string; installed_version: string | null; default_version: string | null }>(`
    SELECT name, installed_version, default_version
      FROM pg_available_extensions
     WHERE name = 'btree_gist'
  `)

  const database = context.rows[0]
  const btreeGist = extension.rows[0]
  if (!database) throw new Error('Não foi possível identificar o banco conectado.')
  if (!database.can_create_database_objects || !database.can_use_public_schema || !database.can_create_public_objects) {
    throw new Error('O usuário não possui CREATE no banco e USAGE/CREATE no schema public.')
  }
  if (!btreeGist) throw new Error('A extensão btree_gist não está disponível nesta instalação PostgreSQL.')

  console.log(JSON.stringify({
    database: database.database_name,
    user: database.user_name,
    permissions: {
      databaseCreate: database.can_create_database_objects,
      publicSchemaUsage: database.can_use_public_schema,
      publicSchemaCreate: database.can_create_public_objects,
    },
    btreeGist: {
      available: true,
      installedVersion: btreeGist.installed_version,
      defaultVersion: btreeGist.default_version,
    },
  }, null, 2))
} finally {
  await client.end()
}
