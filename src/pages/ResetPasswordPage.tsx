import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthMessage, AuthShell, authFieldClass } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Seo } from '@/components/Seo'
import { authApi } from '@/lib/auth-api'

export function ResetPasswordPage() {
  const [params] = useSearchParams(); const token = params.get('token') ?? ''; const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { setMessage((await authApi.resetPassword({ token, password, passwordConfirmation: confirmation })).message) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível redefinir a senha.') } finally { setBusy(false) } }
  return <AuthShell title="Definir nova senha" description="O link é individual, expira e só pode ser usado uma vez."><Seo title="Redefinir senha · Indica" description="Defina uma nova senha para sua conta." /><form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Nova senha<input className={authFieldClass} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} /></label><label className="block text-sm font-medium">Confirmar nova senha<input className={authFieldClass} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>{message && <AuthMessage kind="success">{message} <Link className="underline" to="/login">Entrar.</Link></AuthMessage>}{error && <AuthMessage>{error}</AuthMessage>}<Button size="lg" className="w-full" disabled={busy || !token}>{busy ? 'Salvando…' : 'Redefinir senha'}</Button></form></AuthShell>
}
