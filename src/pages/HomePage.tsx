import { ArrowRight, Layers, ShieldCheck, Upload, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { Seo } from '@/components/Seo'

const recursos = [
  { icon: Layers, titulo: 'Ambiente por carteira', descricao: 'Pernambucanas, Nubank ou qualquer operação com seus próprios indicadores.' },
  { icon: Users, titulo: 'Faixas de grupo', descricao: 'Filtre por tempo de casa, supervisor, produto e operador.' },
  { icon: Upload, titulo: 'Upload de planilhas', descricao: 'Envie o resultado do dia e o painel se atualiza na hora.' },
  { icon: ShieldCheck, titulo: 'Acesso seguro', descricao: 'Estrutura preparada para entrada com conta Google autenticada.' },
]

const destaques = [
  ['Conversão', '19,4%', '+2,1'],
  ['TMA', '312s', '-18s'],
  ['NPS', '72', '+4'],
  ['Operadores', '128', '+6'],
]

export function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-soft">
      <Seo title="Indica · Indicadores de call center" description="Acompanhe indicadores por operação, supervisor, produto e tempo de casa." />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav aria-label="Navegação principal" className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#recursos" className="hover:text-foreground">Recursos</a>
          <a href="#como" className="hover:text-foreground">Como funciona</a>
          <a href="#contato" className="hover:text-foreground">Contato</a>
        </nav>
        <Button asChild><Link to="/login">Entrar</Link></Button>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-12 md:grid-cols-2">
          <div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Gestão de performance</span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight md:text-5xl">
              Os indicadores da sua operação, <span className="text-primary">claros e em um só lugar.</span>
            </h1>
            <p className="mt-5 max-w-md text-muted-foreground">
              Acompanhe conversão, TMA, NPS e absenteísmo por supervisor, produto e tempo de casa — em um painel feito para cada carteira.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/login">Acessar painel <ArrowRight /></Link></Button>
              <Button size="lg" variant="outline" asChild><a href="#recursos">Ver recursos</a></Button>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-5 shadow-card" aria-label="Prévia ilustrativa do painel">
            <p className="mb-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dados ilustrativos</p>
            <div className="grid grid-cols-2 gap-3">
              {destaques.map(([label, valor, variacao]) => (
                <div key={label} className="rounded-2xl bg-secondary p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-2xl font-semibold">{valor}</p>
                  <p className="text-xs font-semibold text-success">{variacao}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-32 items-end gap-2 rounded-2xl bg-secondary p-4">
              {[40, 55, 48, 70, 62, 85, 78, 92].map((altura, index) => (
                <div key={index} className="flex-1 rounded-t-md bg-gradient-primary" style={{ height: `${altura}%` }} />
              ))}
            </div>
          </div>
        </section>

        <section id="recursos" className="bg-card py-20">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-4">
            {recursos.map(({ icon: Icon, titulo, descricao }) => (
              <article key={titulo} className="rounded-2xl border p-6">
                <Icon className="h-6 w-6 text-primary" />
                <h2 className="mt-4 text-base font-semibold">{titulo}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{descricao}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="como" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold">Como funciona</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {['Entre com sua conta Google', 'Escolha a carteira (ex.: Pernambucanas)', 'Envie a planilha e acompanhe o painel'].map((passo, index) => (
              <div key={passo} className="flex gap-4 rounded-2xl bg-card p-6 shadow-card">
                <span className="font-display text-3xl font-semibold text-primary">0{index + 1}</span>
                <p className="font-medium">{passo}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer id="contato" className="border-t py-8 text-center text-sm text-muted-foreground">© 2026 Indica · contato@indica.com.br</footer>
    </div>
  )
}
