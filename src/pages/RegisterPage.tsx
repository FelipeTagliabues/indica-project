import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthMessage, AuthShell, authFieldClass } from '@/components/AuthShell'
import { Button } from '@/components/ui/Button'
import { Seo } from '@/components/Seo'
import { authApi } from '@/lib/auth-api'

export function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirmation: '' })
  const [error, setError] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setExistingEmail(null)
    try {
      const result = await authApi.register(form)
      const params = new URLSearchParams({
        email: form.email,
        delivery: result.emailDelivery.status.toLowerCase(),
      })
      navigate(`/confirmacao-pendente?${params.toString()}`, { replace: true })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a conta.')
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'EMAIL_ALREADY_REGISTERED') {
        setExistingEmail(form.email)
      }
    }
    finally { setBusy(false) }
  }
  const update = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: event.target.value })
  return <AuthShell title="Criar sua conta" description="Use um e-mail válido. Você precisará confirmá-lo antes do primeiro acesso."><Seo title="Criar conta · Indica" description="Cadastre sua conta no Indica." /><form className="mt-6 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Nome completo<input className={authFieldClass} autoComplete="name" value={form.name} onChange={update('name')} required minLength={3} /></label><label className="block text-sm font-medium">E-mail<input className={authFieldClass} type="email" autoComplete="email" value={form.email} onChange={update('email')} required /></label><label className="block text-sm font-medium">Senha<input className={authFieldClass} type="password" autoComplete="new-password" value={form.password} onChange={update('password')} required minLength={12} /><span className="mt-1 block text-xs text-muted-foreground">Mínimo de 12 caracteres, com maiúscula, minúscula e número.</span></label><label className="block text-sm font-medium">Confirmar senha<input className={authFieldClass} type="password" autoComplete="new-password" value={form.passwordConfirmation} onChange={update('passwordConfirmation')} required /></label>{error && <AuthMessage>{error}{existingEmail && <><br /><Link className="underline" to={`/confirmacao-pendente?email=${encodeURIComponent(existingEmail)}`}>Solicitar novo e-mail de confirmação</Link></>}</AuthMessage>}<Button size="lg" className="w-full" disabled={busy}>{busy ? 'Criando…' : 'Criar conta'}</Button></form><p className="mt-5 text-center text-sm text-muted-foreground">Já tem conta? <Link className="text-primary hover:underline" to="/login">Entrar</Link></p></AuthShell>
}
