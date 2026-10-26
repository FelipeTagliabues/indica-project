import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'

export const authFieldClass = 'mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20'

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-gradient-soft px-4 py-10"><div className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-card"><Link to="/" aria-label="Voltar ao início"><Logo /></Link><h1 className="mt-8 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{description}</p>{children}</div></div>
}

export function AuthMessage({ kind = 'error', children }: { kind?: 'error' | 'success'; children: ReactNode }) {
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl px-3 py-2 text-sm ${kind === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>{children}</div>
}
