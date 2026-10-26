import { createHmac } from 'node:crypto'
import { AppError } from '../errors/app-error.js'

type Entry = { count: number; resetAt: number; blockedUntil: number }

export class AuthRateLimiter {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  consume(action: string, identity: string, limit: number, windowMs: number) {
    const now = this.now()
    const key = createHmac('sha256', this.secret).update(`${action}:${identity}`).digest('hex')
    const current = this.entries.get(key)
    if (current?.blockedUntil && current.blockedUntil > now) {
      throw new AppError(
        'Muitas tentativas. Aguarde antes de tentar novamente.',
        429,
        'AUTH_RATE_LIMITED',
        { retryAfterSeconds: Math.ceil((current.blockedUntil - now) / 1000) },
      )
    }
    const entry = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs, blockedUntil: 0 }
      : current
    entry.count += 1
    if (entry.count > limit) {
      entry.blockedUntil = now + windowMs
      this.entries.set(key, entry)
      throw new AppError(
        'Muitas tentativas. Aguarde antes de tentar novamente.',
        429,
        'AUTH_RATE_LIMITED',
        { retryAfterSeconds: Math.ceil(windowMs / 1000) },
      )
    }
    this.entries.set(key, entry)
  }

  clear(action: string, identity: string) {
    const key = createHmac('sha256', this.secret).update(`${action}:${identity}`).digest('hex')
    this.entries.delete(key)
  }
}
