import type { Request } from 'express'
import type { UserRole, UserStatus } from '../generated/prisma/client.js'

export type AuthUser = {
  id: string
  name: string
  email: string
  status: typeof UserStatus[keyof typeof UserStatus]
  role: typeof UserRole[keyof typeof UserRole]
}

export type AuthenticationContext = {
  user: AuthUser
  sessionId: string
  csrfToken: string
}

export type AuthenticatedRequest = Request & { auth?: AuthenticationContext }

export type EmailSender = {
  sendEmailConfirmation(input: { to: string; name: string; confirmationUrl: string }): Promise<void>
  sendPasswordReset(input: { to: string; name: string; resetUrl: string }): Promise<void>
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    role: user.role,
  }
}
