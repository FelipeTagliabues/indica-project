import { createApp } from './app.js'
import { runtimeEnv } from './config/env.js'
import { disconnectPrismaClient } from './lib/prisma.js'

const app = createApp()
const server = app.listen(runtimeEnv.PORT, () => {
  console.log(`Indica API disponível em http://localhost:${runtimeEnv.PORT}`)
})

async function shutdown(signal: string) {
  console.log(`Encerrando a API após ${signal}.`)
  server.close(async () => {
    await disconnectPrismaClient()
    process.exit(0)
  })
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
