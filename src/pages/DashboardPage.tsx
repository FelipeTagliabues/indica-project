import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ClipboardPenLine, LayoutDashboard, LogOut, Settings, TrendingDown, TrendingUp, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/Logo'
import { Seo } from '@/components/Seo'
import { loadRegistrationData, type RegistrationData } from '@/lib/registrations-api'
import { formatTma, loadResults, type DailyResultRecord, type IndicatorCode, type IndicatorTargetRecord } from '@/lib/results-api'

const ranges = [
  { id: 'all', label: 'Todos', min: 0, max: Number.POSITIVE_INFINITY },
  { id: '1', label: 'Até 1 mês', min: 0, max: 1 },
  { id: '2', label: 'Até 2 meses', min: 0, max: 2 },
  { id: '3', label: 'Até 3 meses', min: 0, max: 3 },
  { id: '6', label: '3 a 6 meses', min: 4, max: 6 },
  { id: '6+', label: '+6 meses', min: 7, max: Number.POSITIVE_INFINITY },
]

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Users, label: 'Operadores', path: '/cadastros' },
  { icon: ClipboardPenLine, label: 'Registro diário', path: '/resultados' },
  { icon: Upload, label: 'Uploads', path: '/importacoes' },
  { icon: Settings, label: 'Configurar indicadores' },
]

export function DashboardPage() {
  const [registrations, setRegistrations] = useState<RegistrationData | null>(null)
  const [registrationError, setRegistrationError] = useState<string | null>(null)
  const [environmentChoice, setEnvironmentChoice] = useState('')
  const [skuChoice, setSkuChoice] = useState('')
  const [supervisorId, setSupervisorId] = useState('all')
  const [operatorId, setOperatorId] = useState('all')
  const [rangeId, setRangeId] = useState('all')
  const initialPeriod = useMemo(() => currentMonthPeriod(), [])
  const [dateFrom, setDateFrom] = useState(initialPeriod.from)
  const [dateTo, setDateTo] = useState(initialPeriod.to)
  const [resultState, setResultState] = useState<{
    key: string
    results: DailyResultRecord[]
    targets: IndicatorTargetRecord[]
    error: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadRegistrationData()
      .then((data) => { if (!cancelled) setRegistrations(data) })
      .catch((cause: unknown) => { if (!cancelled) setRegistrationError(messageFrom(cause)) })
    return () => { cancelled = true }
  }, [])

  const environments = useMemo(
    () => registrations?.environments.filter((item) => item.status === 'ACTIVE') ?? [],
    [registrations],
  )
  const environmentId = environments.some((item) => item.id === environmentChoice)
    ? environmentChoice
    : environments[0]?.id ?? ''
  const skus = useMemo(
    () => registrations?.skus.filter((item) => item.environmentId === environmentId && item.status === 'ACTIVE') ?? [],
    [environmentId, registrations],
  )
  const skuId = skus.some((item) => item.id === skuChoice) ? skuChoice : skus[0]?.id ?? ''
  const relatedAssignments = useMemo(
    () => registrations?.assignments.filter((item) => item.environmentId === environmentId && item.skuId === skuId) ?? [],
    [environmentId, registrations, skuId],
  )
  const supervisorOptions = useMemo(() => {
    const ids = new Set(relatedAssignments.map((item) => item.supervisorId))
    return registrations?.supervisors.filter((item) => ids.has(item.id)) ?? []
  }, [registrations, relatedAssignments])
  const operatorOptions = useMemo(() => {
    const ids = new Set(relatedAssignments.map((item) => item.operatorId))
    return registrations?.operators.filter((item) => ids.has(item.id)) ?? []
  }, [registrations, relatedAssignments])
  const selectedSupervisor = supervisorOptions.some((item) => item.id === supervisorId) ? supervisorId : 'all'
  const selectedOperator = operatorOptions.some((item) => item.id === operatorId) ? operatorId : 'all'
  const invalidPeriod = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const queryKey = environmentId && skuId && dateFrom && dateTo && dateFrom <= dateTo
    ? [environmentId, skuId, dateFrom, dateTo, selectedSupervisor, selectedOperator].join(':')
    : ''

  useEffect(() => {
    if (!queryKey) return
    let cancelled = false
    loadResults({
      environmentId,
      skuId,
      dateFrom,
      dateTo,
      ...(selectedSupervisor === 'all' ? {} : { supervisorId: selectedSupervisor }),
      ...(selectedOperator === 'all' ? {} : { operatorId: selectedOperator }),
    })
      .then((response) => {
        if (!cancelled) setResultState({ key: queryKey, ...response, error: null })
      })
      .catch((cause: unknown) => {
        if (!cancelled) setResultState({ key: queryKey, results: [], targets: [], error: messageFrom(cause) })
      })
    return () => { cancelled = true }
  }, [dateFrom, dateTo, environmentId, queryKey, selectedOperator, selectedSupervisor, skuId])

  const response = resultState?.key === queryKey ? resultState : null
  const range = ranges.find((item) => item.id === rangeId) ?? ranges[0]!
  const results = useMemo(() => (response?.results ?? []).filter((result) => {
    const months = tenureMonths(result.assignment.operator.admissionDate, result.resultDate)
    return months >= range.min && months <= range.max
  }), [range, response])
  const targets = response?.targets ?? []
  const currentEnvironment = environments.find((item) => item.id === environmentId)
  const currentSku = skus.find((item) => item.id === skuId)
  const metrics = metricCards(results, targets)
  const evolution = evolutionData(results)
  const bySupervisor = supervisorData(results)

  return (
    <div className="flex min-h-screen bg-background">
      <Seo title="Painel · Indica" description="Dashboard de indicadores operacionais persistidos." />
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar p-5 md:flex">
        <Logo />
        <nav aria-label="Menu do painel" className="mt-10 space-y-1 text-sm font-medium">
          {menuItems.map(({ icon: Icon, label, active, path }) => {
            const className = `flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground'} ${path ? 'hover:bg-sidebar-accent hover:text-foreground' : ''}`
            return path ? <Link key={label} to={path} className={className}><Icon className="h-4 w-4" /> {label}</Link> : <div key={label} aria-current={active ? 'page' : undefined} className={className}><Icon className="h-4 w-4" /> {label}</div>
          })}
        </nav>
        <Link to="/" className="mt-auto flex items-center gap-3 px-3 text-sm text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" /> Sair</Link>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">{currentSku?.name ?? 'Operação não selecionada'}</p><h1 className="text-2xl font-semibold">{currentEnvironment ? `Ambiente ${currentEnvironment.name}` : 'Dashboard operacional'}</h1><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${registrations ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning-foreground'}`}>{registrations ? 'Dados operacionais · PostgreSQL' : 'Consultando persistência'}</span></div>
          <Button asChild><Link to="/resultados"><ClipboardPenLine /> Registrar resultado</Link></Button>
        </div>

        {registrationError && <Feedback>{registrationError}</Feedback>}
        {response?.error && <Feedback>{response.error}</Feedback>}
        {invalidPeriod && <Feedback>A data final não pode ser anterior à data inicial.</Feedback>}

        <section aria-label="Filtros" className="mt-6 rounded-2xl border bg-card p-4 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Filter label="Ambiente"><select value={environmentId} onChange={(event) => { setEnvironmentChoice(event.target.value); setSkuChoice(''); setSupervisorId('all'); setOperatorId('all') }}><option value="">Selecione</option>{environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Filter>
            <Filter label="SKU"><select value={skuId} onChange={(event) => { setSkuChoice(event.target.value); setSupervisorId('all'); setOperatorId('all') }}><option value="">Selecione</option>{skus.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Filter>
            <Filter label="Início"><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></Filter>
            <Filter label="Fim"><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></Filter>
            <Filter label="Supervisor"><select value={selectedSupervisor} onChange={(event) => { setSupervisorId(event.target.value); setOperatorId('all') }}><option value="all">Todos</option>{supervisorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Filter>
            <Filter label="Operador"><select value={selectedOperator} onChange={(event) => setOperatorId(event.target.value)}><option value="all">Todos</option>{operatorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Filter>
          </div>
        </section>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {ranges.map((item) => <button key={item.id} type="button" onClick={() => setRangeId(item.id)} className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${rangeId === item.id ? 'bg-primary text-primary-foreground shadow-glow' : 'border bg-card text-muted-foreground hover:text-foreground'}`}>{item.label}</button>)}
        </div>

        {!registrations || (queryKey && !response) ? <Card className="mt-6"><p className="py-10 text-center text-sm text-muted-foreground">Consultando dados operacionais…</p></Card> : !environmentId || !skuId ? <Card className="mt-6"><Empty>Cadastre e selecione um ambiente e um SKU para visualizar o dashboard.</Empty></Card> : (
          <>
            <section aria-label="Indicadores" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.code} metric={metric} />)}</section>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card title="Evolução no período" className="lg:col-span-2">{evolution.length ? <div className="h-60 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={evolution}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} /><YAxis stroke="var(--muted-foreground)" fontSize={12} /><Tooltip /><Line type="monotone" dataKey="nps" name="NPS" stroke="var(--chart-1)" strokeWidth={3} dot={false} /><Line type="monotone" dataKey="retention" name="Retenção (%)" stroke="var(--chart-2)" strokeWidth={3} dot={false} /></LineChart></ResponsiveContainer></div> : <Empty>Sem resultados no período selecionado.</Empty>}</Card>
              <Card title="NPS por supervisor">{bySupervisor.length ? <div className="h-60 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={bySupervisor} layout="vertical"><XAxis type="number" domain={[-100, 100]} hide /><YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={12} width={80} /><Tooltip /><Bar dataKey="value" name="NPS" fill="var(--chart-2)" radius={[0, 8, 8, 0]} /></BarChart></ResponsiveContainer></div> : <Empty>Sem dados por supervisor.</Empty>}</Card>
            </div>
            <Card title={`Registros (${results.length})`} className="mt-6">{!results.length ? <Empty>Nenhum resultado encontrado para os filtros.</Empty> : <div className="max-h-[340px] overflow-auto"><table className="w-full min-w-[860px] text-sm"><thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr><th className="py-2">Data</th><th>Operador</th><th>Supervisor</th><th>Casa</th><th>NPS</th><th>TMA</th><th>Retenção</th><th>Rechamada</th></tr></thead><tbody>{results.map((result) => <tr key={result.id} className="border-t"><td className="py-2">{dateLabel(result.resultDate)}</td><td className="font-medium">{result.assignment.operator.name}</td><td>{result.assignment.supervisor.name}</td><td>{tenureMonths(result.assignment.operator.admissionDate, result.resultDate)}m</td><td>{metricLabel(result.nps)}</td><td>{result.tmaSeconds === null ? '—' : formatTma(result.tmaSeconds)}</td><td>{metricLabel(result.cardRetention, '%')}</td><td>{metricLabel(result.callbackRate, '%')}</td></tr>)}</tbody></table></div>}</Card>
          </>
        )}
      </main>
    </div>
  )
}

type Metric = { code: IndicatorCode; label: string; value: number | null; target: number | null; higherIsBetter: boolean; format: (value: number) => string; difference: (value: number) => string }

function metricCards(results: DailyResultRecord[], targets: IndicatorTargetRecord[]): Metric[] {
  const target = (code: IndicatorCode) => targets.find((item) => item.indicator === code)?.value ?? null
  return [
    { code: 'NPS', label: 'NPS', value: average(results.map((item) => item.nps)), target: target('NPS'), higherIsBetter: true, format: numberLabel, difference: (value) => `${signed(value)} pontos` },
    { code: 'TMA_SECONDS', label: 'TMA', value: average(results.map((item) => item.tmaSeconds)), target: target('TMA_SECONDS'), higherIsBetter: false, format: (value) => formatTma(Math.round(value)), difference: (value) => `${value >= 0 ? '+' : '−'}${formatTma(Math.round(Math.abs(value)))}` },
    { code: 'CARD_RETENTION', label: 'Retenção do cartão', value: average(results.map((item) => item.cardRetention)), target: target('CARD_RETENTION'), higherIsBetter: true, format: (value) => `${numberLabel(value)}%`, difference: (value) => `${signed(value)} p.p.` },
    { code: 'CALLBACK_RATE', label: 'Rechamada', value: average(results.map((item) => item.callbackRate)), target: target('CALLBACK_RATE'), higherIsBetter: false, format: (value) => `${numberLabel(value)}%`, difference: (value) => `${signed(value)} p.p.` },
  ]
}

function MetricCard({ metric }: { metric: Metric }) {
  const hasComparison = metric.value !== null && metric.target !== null
  const achieved = hasComparison && (metric.higherIsBetter ? metric.value! >= metric.target! : metric.value! <= metric.target!)
  const difference = hasComparison ? metric.value! - metric.target! : null
  return <div className="rounded-2xl border bg-card p-5 shadow-card"><p className="text-sm text-muted-foreground">{metric.label}</p><p className="mt-2 font-display text-3xl font-semibold">{metric.value === null ? '—' : metric.format(metric.value)}</p>{metric.target === null ? <p className="mt-2 text-xs font-semibold text-muted-foreground">Meta não configurada</p> : metric.value === null ? <p className="mt-2 text-xs font-semibold text-muted-foreground">Meta {metric.format(metric.target)} · sem dados</p> : <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${achieved ? 'text-success' : 'text-destructive'}`}>{achieved ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} {metric.difference(difference!)} vs. meta {metric.format(metric.target)}</p>}</div>
}

function evolutionData(results: DailyResultRecord[]) {
  const groups = new Map<string, DailyResultRecord[]>()
  for (const result of results) groups.set(result.resultDate, [...(groups.get(result.resultDate) ?? []), result])
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date: dateLabel(date), nps: roundNullable(average(items.map((item) => item.nps))), retention: roundNullable(average(items.map((item) => item.cardRetention))) }))
}

function supervisorData(results: DailyResultRecord[]) {
  const groups = new Map<string, number[]>()
  for (const result of results) {
    if (result.nps !== null) groups.set(result.assignment.supervisor.name, [...(groups.get(result.assignment.supervisor.name) ?? []), result.nps])
  }
  return [...groups.entries()].map(([name, values]) => ({ name: name.split(' ')[0], value: round(average(values) ?? 0) }))
}

function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border bg-card p-5 shadow-card ${className}`}>{title && <h2 className="mb-4 text-sm font-semibold">{title}</h2>}{children}</section>
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-xs font-semibold text-muted-foreground">{label}<div className="[&_input]:h-9 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:bg-background [&_input]:px-3 [&_input]:text-sm [&_select]:h-9 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:bg-background [&_select]:px-3 [&_select]:text-sm">{children}</div></label>
}

function Feedback({ children }: { children: ReactNode }) { return <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{children}</p> }
function Empty({ children }: { children: ReactNode }) { return <p className="rounded-xl bg-muted px-4 py-10 text-center text-sm text-muted-foreground">{children}</p> }
function average(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null)
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null
}
function round(value: number) { return Math.round(value * 100) / 100 }
function roundNullable(value: number | null) { return value === null ? null : round(value) }
function signed(value: number) { return `${value >= 0 ? '+' : '−'}${numberLabel(Math.abs(value))}` }
function numberLabel(value: number) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value) }
function metricLabel(value: number | null, suffix = '') { return value === null ? '—' : `${numberLabel(value)}${suffix}` }

function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}` : value
}

function tenureMonths(admissionDate: string, resultDate: string) {
  const admission = new Date(`${admissionDate.slice(0, 10)}T00:00:00.000Z`)
  const result = new Date(`${resultDate.slice(0, 10)}T00:00:00.000Z`)
  let months = (result.getUTCFullYear() - admission.getUTCFullYear()) * 12 + result.getUTCMonth() - admission.getUTCMonth()
  if (result.getUTCDate() < admission.getUTCDate()) months -= 1
  return Math.max(0, months)
}

function currentMonthPeriod() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  }
}

function messageFrom(cause: unknown) { return cause instanceof Error ? cause.message : 'Não foi possível consultar os dados operacionais.' }
