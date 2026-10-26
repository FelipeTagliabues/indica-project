import { createApp, type AppOptions } from '../../src/app.js'
import { UserRole, UserStatus } from '../../src/generated/prisma/client.js'

export const testAuthUser = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Usuário de teste',
  email: 'testes@indica.local',
  status: UserStatus.ACTIVE,
  role: UserRole.USER,
}

export function createAuthenticatedTestApp(options: AppOptions = {}) {
  return createApp({ ...options, authenticationBypass: options.authenticationBypass ?? testAuthUser })
}
