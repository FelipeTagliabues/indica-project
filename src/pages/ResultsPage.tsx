import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ClipboardPenLine, LayoutDashboard, Settings, Upload, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Seo } from '@/components/Seo'
import { LogoutButton } from '@/components/LogoutButton'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { loadRegistrationData, type RegistrationData } from '@/lib/registrations-api'
import {
  createResult,
  formatTma,
  loadResults,
  parseTma,
  updateResult,
  type DailyResultRecord,
} from '@/lib/results-api'

const fieldClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50'
const labelClass = 'grid gap-1.5 text-xs font-semibold text-muted-foreground'

export function ResultsPage() {
  const { user } = useAuth()
  const [registrations, setRegistrations] = useState<RegistrationData | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [environmentChoice, setEnvironmentChoice] = useState('')
  const [skuChoice, setSkuChoice] = useState('')
  const [assignmentChoice, setAssignmentChoice] = useState('')
  const [resultDate, setResultDate] = useState(todayValue())
  const actorIdentifier = user?.email ?? ''
  const [nps, setNps] = useState('')
  const [tma, setTma] = useState('')
  const [cardRetention, setCardRetention] = useState('')
  const [callbackRate, setCallbackRate] = useState('')
  const [editing, setEditing] = useState<DailyResultRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const [resultState, setResultState] = useState<{
    key: string
    data: DailyResultRecord[]
    error: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadRegistrationData()
      .then((data) => { if (!cancelled) setRegistrations(data) })
      .catch((cause: unknown) => { if (!cancelled) setRegistrationError(messageFrom(cause)) })
    return () => { cancelled = true }
  }, [])

  const activeEnvironments = useMemo(
    () => registrations?.environments.filter((item) => item.status === 'ACTIVE') ?? [],
    [registrations],
  )
  const environmentId = activeEnvironments.some((item) => item.id === environmentChoice)
    ? environmentChoice
    : activeEnvironments[0]?.id ?? ''
  const activeSkus = useMemo(
    () => registrations?.skus.filter((item) => item.status === 'ACTIVE' && item.environmentId === environmentId) ?? [],
    [environmentId, registrations],
  )
  const skuId = activeSkus.some((item) => item.id === skuChoice) ? skuChoice : activeSkus[0]?.id ?? ''
  const validAssignments = useMemo(() => registrations?.assignments.filter((assignment) => (
    assignment.environmentId === environmentId
    && assignment.skuId === skuId
    && assignment.validFrom.slice(0, 10) <= resultDate
    && (!assignment.validTo || assignment.validTo.slice(0, 10) >= resultDate)
    && registrations.operators.some((operator) => operator.id === assignment.operatorId && operator.status === 'ACTIVE')
  )) ?? [], [environmentId, registrations, resultDate, skuId])
  const assignmentId = validAssignments.some((item) => item.id === assignmentChoice)
    ? assignmentChoice
    : validAssignments[0]?.id ?? ''
  const resultKey = environmentId && skuId ? `${environmentId}:${skuId}:${resultDate}` : ''

  const refreshResults = useCallback(async () => {
    if (!environmentId || !skuId) return false
    try {
      const response = await loadResults({
        environmentId,
        skuId,
        dateFrom: resultDate,
        dateTo: resultDate,
      })
      setResultState({ key: resultKey, data: response.results, error: null })
      return true
    } catch (cause) {
      setResultState({ key: resultKey, data: [], error: messageFrom(cause) })
      return false
    }
  }, [environmentId, resultDate, resultKey, skuId])

  useEffect(() => {
    if (!resultKey) return
    let cancelled = false
    loadResults({ environmentId, skuId, dateFrom: resultDate, dateTo: resultDate })
      .then((response) => {
        if (!cancelled) setResultState({ key: resultKey, data: response.results, error: null })
      })
      .catch((cause: unknown) => {
        if (!cancelled) setResultState({ key: resultKey, data: [], error: messageFrom(cause) })
      })
    return () => { cancelled = true }
  }, [environmentId, resultDate, resultKey, skuId])

  const results = resultState?.key === resultKey ? resultState.data : []
  const resultError = resultState?.key === resultKey ? resultState.error : null
  const resultsLoading = Boolean(resultKey) && resultState?.key !== resultKey

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFeedback(null)
    const tmaSeconds = parseTma(tma)
    if (tmaSeconds === null) {
      setFeedback({ tone: 'error', message: 'Informe o TMA em minutos ou no formato MM:SS.' })
      return
    }
    if (!assignmentId) {
      setFeedback({ tone: 'error', message: 'Não existe atribuição válida para o operador nessa data.' })
      return
    }
    const actor = actorIdentifier.trim()
    const payload = {
      assignmentId,
      resultDate,
      nps: Number(nps),
      tmaSeconds,
      cardRetention: Number(cardRetention),
      callbackRate: Number(callbackRate),
      actorIdentifier: actor,
    }
    if (editing && !window.confirm('Substituir os quatro indicadores deste registro? Os valores anteriores serão preservados na auditoria.')) return

    setBusy(true)
    try {
      if (editing) {
        await updateResult(editing.id, { ...payload, version: editing.version, confirmReplacement: true })
      } else {
        await createResult(payload)
      }
      const refreshed = await refreshResults()
      if (refreshed) {
        setFeedback({ tone: 'success', message: editing ? 'Registro corrigido e auditado.' : 'Registro diário salvo.' })
        clearMetrics()
      }
    } catch (cause) {
      setFeedback({ tone: 'error', message: messageFrom(cause) })
    } finally {
      setBusy(false)
    }
  }

  const editResult = (result: DailyResultRecord) => {
    setEnvironmentChoice(result.assignment.environment.id)
    setSkuChoice(result.assignment.sku.id)
    setAssignmentChoice(result.assignmentId)
    setResultDate(result.resultDate)
    setNps(result.nps === null ? '' : String(result.nps))
    setTma(result.tmaSeconds === null ? '' : formatTma(result.tmaSeconds))
    setCardRetention(result.cardRetention === null ? '' : String(result.cardRetention))
    setCallbackRate(result.callbackRate === null ? '' : String(result.callbackRate))
    setEditing(result)
    setFeedback(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const clearMetrics = () => {
    setNps('')
    setTma('')
    setCardRetention('')
    setCallbackRate('')
    setEditing(null)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Seo title="Registro diário · Indica" description="Registro individual dos indicadores operacionais." />
      <Sidebar active="results" />

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Operação diária</p>
            <h1 className="text-2xl font-semibold">Registro de indicadores</h1>
            <p className="mt-1 text-sm text-muted-foreground">Os quatro indicadores são obrigatórios e gravados diretamente no PostgreSQL.</p>
          </div>
          <Button asChild variant="outline"><Link to="/painel"><LayoutDashboard /> Ver dashboard</Link></Button>
        </div>

        {registrationError && <Feedback tone="error">{registrationError}</Feedback>}
        {feedback && <Feedback tone={feedback.tone}>{feedback.message}</Feedback>}

        {!registrations ? (
          <Panel className="mt-6"><p className="py-12 text-center text-sm text-muted-foreground">{registrationError ? 'Persistência indisponível. Nenhum dado foi considerado salvo.' : 'Consultando cadastros…'}</p></Panel>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(300px,420px)_1fr]">
            <Panel>
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{editing ? 'Corrigir registro' : 'Novo registro'}</h2>
                {editing && <Button type="button" variant="ghost" onClick={clearMetrics}>Cancelar edição</Button>}
              </div>
              <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
                <Field label="Ambiente"><select className={fieldClass} value={environmentId} onChange={(event) => { setEnvironmentChoice(event.target.value); setSkuChoice(''); setAssignmentChoice(''); clearMetrics() }} required><option value="">Selecione</option>{activeEnvironments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="SKU"><select className={fieldClass} value={skuId} onChange={(event) => { setSkuChoice(event.target.value); setAssignmentChoice(''); clearMetrics() }} required><option value="">Selecione</option>{activeSkus.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Data operacional"><input className={fieldClass} type="date" value={resultDate} onChange={(event) => { setResultDate(event.target.value); setAssignmentChoice(''); clearMetrics() }} required /></Field>
                <Field label="Operador e atribuição vigente"><select className={fieldClass} value={assignmentId} onChange={(event) => { setAssignmentChoice(event.target.value); clearMetrics() }} required><option value="">Selecione</option>{validAssignments.map((item) => <option key={item.id} value={item.id}>{item.operator.name} · {item.supervisor.name}</option>)}</select></Field>

                {!validAssignments.length && environmentId && skuId && <p className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Nenhuma atribuição válida foi encontrada para esta data.</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricInput label="NPS" value={nps} onChange={setNps} min={-100} max={100} />
                  <Field label="TMA (MM ou MM:SS)"><input className={fieldClass} value={tma} onChange={(event) => setTma(event.target.value)} required inputMode="numeric" placeholder="05:30" pattern="\d+(?::[0-5]\d)?" /></Field>
                  <MetricInput label="Retenção do cartão (%)" value={cardRetention} onChange={setCardRetention} min={0} max={100} />
                  <MetricInput label="Rechamada (%)" value={callbackRate} onChange={setCallbackRate} min={0} max={100} />
                </div>
                <Button disabled={busy || !assignmentId} type="submit"><ClipboardPenLine /> {editing ? 'Substituir registro' : 'Salvar registro'}</Button>
              </form>
            </Panel>

            <Panel>
              <h2 className="mb-4 text-sm font-semibold">Registros da data selecionada</h2>
              {resultError ? <p role="alert" className="rounded-xl bg-destructive/5 px-4 py-3 text-sm text-destructive">{resultError}</p> : resultsLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Consultando resultados…</p> : !resultKey ? <Empty>Cadastre um ambiente e um SKU para iniciar.</Empty> : !results.length ? <Empty>Nenhum resultado registrado para esta data.</Empty> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Operador</th><th>Supervisor</th><th>NPS</th><th>TMA</th><th>Retenção</th><th>Rechamada</th><th /></tr></thead>
                    <tbody>{results.map((result) => <tr key={result.id} className="border-t"><td className="py-3 pr-4 font-medium">{result.assignment.operator.name}<span className="block text-xs font-normal text-muted-foreground">{result.assignment.operator.login}</span></td><td className="pr-4">{result.assignment.supervisor.name}</td><td>{metricLabel(result.nps)}</td><td>{result.tmaSeconds === null ? '—' : formatTma(result.tmaSeconds)}</td><td>{metricLabel(result.cardRetention, '%')}</td><td>{metricLabel(result.callbackRate, '%')}</td><td><Button type="button" variant="ghost" onClick={() => editResult(result)}>Editar</Button></td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
      </main>
    </div>
  )
}

function Sidebar({ active }: { active: 'results' }) {
  return <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar p-5 md:flex"><Logo /><nav aria-label="Menu do painel" className="mt-10 space-y-1 text-sm font-medium"><MenuLink to="/painel" icon={<LayoutDashboard />} label="Dashboard" /><MenuLink to="/cadastros" icon={<Users />} label="Operadores" /><div aria-current={active === 'results' ? 'page' : undefined} className="flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-2.5 text-sidebar-accent-foreground"><ClipboardPenLine className="h-4 w-4" /> Registro diário</div><MenuLink to="/importacoes" icon={<Upload />} label="Uploads" /><div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground"><Settings className="h-4 w-4" /> Configurar indicadores</div></nav><LogoutButton /></aside>
}

function MenuLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">{icon}{label}</Link>
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border bg-card p-5 shadow-card ${className}`}>{children}</section>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={labelClass}>{label}{children}</label>
}

function MetricInput({ label, value, onChange, min, max }: { label: string; value: string; onChange: (value: string) => void; min: number; max: number }) {
  return <Field label={label}><input className={fieldClass} type="number" value={value} onChange={(event) => onChange(event.target.value)} required step="0.01" min={min} max={max} /></Field>
}

function Feedback({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-success/25 bg-success/5 text-success'}`}>{children}</div>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-muted px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>
}

function numberLabel(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)
}

function metricLabel(value: number | null, suffix = '') {
  return value === null ? '—' : `${numberLabel(value)}${suffix}`
}

function todayValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}
