import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi, setCsrfToken, type AuthUser } from '@/lib/auth-api'
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    authApi.session().then((current) => { if (active) setUser(current) }).catch(() => setCsrfToken(null)).finally(() => {
      if (active) setLoading(false)
    })
    const unauthorized = () => setUser(null)
    window.addEventListener('indica:unauthorized', unauthorized)
    return () => { active = false; window.removeEventListener('indica:unauthorized', unauthorized) }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login: async (email, password) => setUser(await authApi.login(email, password)),
    logout: async () => { await authApi.logout(); setUser(null) },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
