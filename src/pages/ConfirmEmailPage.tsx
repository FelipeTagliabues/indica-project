import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthMessage, AuthShell } from '@/components/AuthShell'
import { Seo } from '@/components/Seo'
import { authApi } from '@/lib/auth-api'

export function ConfirmEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(token ? null : { ok: false, message: 'O link não possui um token válido.' })
  useEffect(() => { if (!token) return; authApi.confirmEmail(token).then((value) => setState({ ok: true, message: value.message })).catch((cause) => setState({ ok: false, message: cause instanceof Error ? cause.message : 'Não foi possível confirmar.' })) }, [token])
  return <AuthShell title="Confirmação de e-mail" description="Estamos validando seu link de acesso."><Seo title="Confirmação de e-mail · Indica" description="Ative sua conta Indica." />{!state ? <p className="mt-6 text-sm text-muted-foreground">Validando…</p> : <AuthMessage kind={state.ok ? 'success' : 'error'}>{state.message}</AuthMessage>}<p className="mt-5 text-center text-sm"><Link className="text-primary hover:underline" to="/login">Ir para o login</Link></p></AuthShell>
}
