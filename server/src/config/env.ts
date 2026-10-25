import 'dotenv/config'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'

const runtimeSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
})

const databaseUrlSchema = z
  .string()
  .min(1, 'DATABASE_URL é obrigatória para operações de persistência.')
  .regex(/^postgres(?:ql)?:\/\//, 'DATABASE_URL deve usar o protocolo PostgreSQL.')

export const runtimeEnv = runtimeSchema.parse(process.env)

export function getDatabaseUrl() {
  const result = databaseUrlSchema.safeParse(process.env.DATABASE_URL)
  if (!result.success) {
    throw new AppError(
      'Persistência indisponível: DATABASE_URL não foi configurada para a API.',
      503,
      'DATABASE_NOT_CONFIGURED',
    )
  }
  return result.data
}
