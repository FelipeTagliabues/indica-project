import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { Seo } from '@/components/Seo'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-soft px-4">
      <Seo title="Entrar · Indica" description="Acesse o painel de indicadores com sua conta Google." />
      <div className="w-full max-w-sm rounded-3xl border bg-card p-8 shadow-card">
        <Link to="/" aria-label="Voltar ao início"><Logo /></Link>
        <h1 className="mt-8 text-2xl font-semibold">Bem-vindo de volta</h1>
        <p className="mt-2 text-sm text-muted-foreground">Por segurança, o acesso é previsto apenas com uma conta Google autorizada.</p>
        <div className="mt-5 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
          Protótipo local: autenticação Google ainda não configurada. O botão abaixo abre apenas o modo de demonstração.
        </div>
        <Button size="lg" variant="outline" className="mt-5 w-full" onClick={() => navigate('/painel')}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22ZM6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14ZM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6Z" /></svg>
          Entrar com Google
        </Button>
        <p className="mt-6 text-center text-xs text-muted-foreground">Sem acesso? Fale com o administrador da sua operação.</p>
      </div>
    </div>
  )
}
