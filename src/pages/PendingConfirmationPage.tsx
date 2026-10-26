import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthMessage, AuthShell, authFieldClass } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Seo } from '@/components/Seo'
import { authApi } from '@/lib/auth-api'

export function PendingConfirmationPage() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function resend() { setBusy(true); setError(null); setMessage(null); try { setMessage((await authApi.resendConfirmation(email)).message) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no reenvio.') } finally { setBusy(false) } }
  return <AuthShell title="Confirme seu e-mail" description="Enviamos um link de confirmação. O acesso só será liberado depois dessa etapa."><Seo title="Confirmar e-mail · Indica" description="Confirme o e-mail da sua conta." /><label className="mt-6 block text-sm font-medium">E-mail<input className={authFieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{message && <AuthMessage kind="success">{message}</AuthMessage>}{error && <AuthMessage>{error}</AuthMessage>}<Button size="lg" variant="outline" className="mt-4 w-full" disabled={busy || !email} onClick={() => void resend()}>{busy ? 'Enviando…' : 'Reenviar confirmação'}</Button><p className="mt-5 text-center text-sm"><Link className="text-primary hover:underline" to="/login">Voltar ao login</Link></p></AuthShell>
}
