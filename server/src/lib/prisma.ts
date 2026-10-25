import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { getDatabaseUrl } from '../config/env.js'

let prismaClient: PrismaClient | undefined

export function getPrismaClient() {
  if (!prismaClient) {
    const adapter = new PrismaPg({ connectionString: getDatabaseUrl() })
    prismaClient = new PrismaClient({ adapter })
  }

  return prismaClient
}

export async function disconnectPrismaClient() {
  if (!prismaClient) return
  await prismaClient.$disconnect()
  prismaClient = undefined
}
