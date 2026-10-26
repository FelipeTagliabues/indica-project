import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthMessage, AuthShell, authFieldClass } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Seo } from '@/components/Seo'
import { useAuth } from '@/hooks/useAuth'
import { AuthApiError } from '@/lib/auth-api'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/painel" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(null); setPendingEmail(null)
    try {
      await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/') ? from : '/painel', { replace: true })
    } catch (cause) {
      if (cause instanceof AuthApiError && cause.code === 'EMAIL_CONFIRMATION_REQUIRED') setPendingEmail(email)
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
    } finally { setBusy(false) }
  }

  return <AuthShell title="Bem-vindo de volta" description="Entre com o e-mail e a senha da sua conta Indica."><Seo title="Entrar · Indica" description="Acesse o painel de indicadores." /><form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">E-mail<input className={authFieldClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="block text-sm font-medium">Senha<input className={authFieldClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <AuthMessage>{error}{pendingEmail && <> <Link className="underline" to={`/confirmacao-pendente?email=${encodeURIComponent(pendingEmail)}`}>Reenviar confirmação.</Link></>}</AuthMessage>}<Button size="lg" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button></form><div className="mt-5 flex justify-between text-sm"><Link className="text-primary hover:underline" to="/esqueci-senha">Esqueci minha senha</Link><Link className="text-primary hover:underline" to="/cadastro">Criar conta</Link></div></AuthShell>
}
