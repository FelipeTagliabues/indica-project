import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthMessage, AuthShell, authFieldClass } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Seo } from '@/components/Seo'
import { authApi } from '@/lib/auth-api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { setMessage((await authApi.forgotPassword(email)).message) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao solicitar recuperação.') } finally { setBusy(false) } }
  return <AuthShell title="Recuperar senha" description="Informe seu e-mail. A resposta será a mesma exista ou não uma conta, para proteger sua privacidade."><Seo title="Recuperar senha · Indica" description="Solicite a redefinição da sua senha." /><form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">E-mail<input className={authFieldClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{message && <AuthMessage kind="success">{message}</AuthMessage>}{error && <AuthMessage>{error}</AuthMessage>}<Button size="lg" className="w-full" disabled={busy}>{busy ? 'Enviando…' : 'Enviar instruções'}</Button></form><p className="mt-5 text-center text-sm"><Link className="text-primary hover:underline" to="/login">Voltar ao login</Link></p></AuthShell>
}
