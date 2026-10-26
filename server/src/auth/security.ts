import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import argon2 from 'argon2'

const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(password: string) {
  return argon2.hash(password, passwordOptions)
}

export async function verifyPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

export async function consumeUnknownPasswordTime(password: string) {
  await argon2.hash(password, passwordOptions)
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function tokenHash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function csrfToken(secret: string, sessionId: string) {
  return createHmac('sha256', secret).update(sessionId, 'utf8').digest('base64url')
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}
