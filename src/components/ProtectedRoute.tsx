import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Verificando sessão…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
