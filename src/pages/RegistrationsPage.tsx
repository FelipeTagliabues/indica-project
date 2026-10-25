import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ClipboardPenLine, Database, LayoutDashboard, LogOut, Settings, Upload, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Seo } from '@/components/Seo'
import { Button } from '@/components/ui/Button'
import {
  loadRegistrationData,
  registrationsApi,
  type AssignmentRecord,
  type EnvironmentRecord,
  type OperatorRecord,
  type RegistrationData,
} from '@/lib/registrations-api'

type SectionId = 'environments' | 'skus' | 'supervisors' | 'operators' | 'assignments'

const sections: Array<{ id: SectionId; label: string }> = [
  { id: 'environments', label: 'Ambientes' },
  { id: 'skus', label: 'SKUs' },
  { id: 'supervisors', label: 'Supervisores' },
  { id: 'operators', label: 'Operadores' },
  { id: 'assignments', label: 'Atribuições' },
]

const fieldClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50'
const labelClass = 'grid gap-1.5 text-xs font-semibold text-muted-foreground'

export function RegistrationsPage() {
  const [section, setSection] = useState<SectionId>('environments')
  const [data, setData] = useState<RegistrationData | null>(null)
  const [actorIdentifier, setActorIdentifier] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loadRegistrationData())
      return true
    } catch (cause) {
      setData(null)
      setError(messageFrom(cause))
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadRegistrationData()
      .then((records) => {
        if (!cancelled) setData(records)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageFrom(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const mutate = async (successMessage: string, operation: (actor: string) => Promise<unknown>) => {
    const actor = actorIdentifier.trim()
    if (actor.length < 3) {
      setError('Informe o responsável pela alteração. Este campo ainda não representa uma identidade autenticada.')
      return false
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await operation(actor)
      if (!await reload()) return false
      setNotice(successMessage)
      return true
    } catch (cause) {
      setError(messageFrom(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Seo title="Cadastros · Indica" description="Cadastros operacionais persistidos do Indica." />

      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar p-5 md:flex">
        <Logo />
        <nav aria-label="Menu do painel" className="mt-10 space-y-1 text-sm font-medium">
          <Link to="/painel" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <div aria-current="page" className="flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-2.5 text-sidebar-accent-foreground">
            <Users className="h-4 w-4" /> Operadores
          </div>
          <Link to="/resultados" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <ClipboardPenLine className="h-4 w-4" /> Registro diário
          </Link>
          <Link to="/importacoes" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Upload className="h-4 w-4" /> Uploads</Link>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground"><Settings className="h-4 w-4" /> Configurar indicadores</div>
        </nav>
        <Link to="/" className="mt-auto flex items-center gap-3 px-3 text-sm text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sair
        </Link>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Persistência operacional</p>
            <h1 className="text-2xl font-semibold">Cadastros</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Ambientes, equipes e vigências gravados diretamente pela API no PostgreSQL configurado.
            </p>
          </div>
          <Button asChild variant="outline"><Link to="/painel"><LayoutDashboard /> Voltar ao painel</Link></Button>
        </div>

        <section className="mt-6 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className={`${labelClass} max-w-lg flex-1`}>
              Responsável informado
              <input
                className={fieldClass}
                value={actorIdentifier}
                onChange={(event) => setActorIdentifier(event.target.value)}
                placeholder="Nome ou identificação do responsável"
                maxLength={160}
              />
            </label>
            <p className="max-w-xl rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
              Identificação declarada, ainda não autenticada. Cada alteração é registrada na auditoria.
            </p>
          </div>
        </section>

        {error && <Feedback tone="error">{error}</Feedback>}
        {notice && <Feedback tone="success">{notice}</Feedback>}

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Tipos de cadastro">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              onClick={() => { setSection(item.id); setError(null); setNotice(null) }}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${section === item.id ? 'bg-primary text-primary-foreground shadow-glow' : 'border bg-card text-muted-foreground hover:text-foreground'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-6 grid min-h-64 place-items-center rounded-2xl border bg-card text-sm text-muted-foreground shadow-card">
            Consultando cadastros…
          </div>
        ) : data ? (
          <div className="mt-6">
            {section === 'environments' && <EnvironmentsSection data={data} busy={busy} mutate={mutate} />}
            {section === 'skus' && <SkusSection data={data} busy={busy} mutate={mutate} />}
            {section === 'supervisors' && <SupervisorsSection data={data} busy={busy} mutate={mutate} />}
            {section === 'operators' && <OperatorsSection data={data} busy={busy} mutate={mutate} />}
            {section === 'assignments' && <AssignmentsSection data={data} busy={busy} mutate={mutate} />}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-card p-6 shadow-card">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="text-sm font-semibold">Persistência indisponível</h2>
                <p className="mt-1 text-sm text-muted-foreground">Nenhum dado foi armazenado localmente ou considerado salvo.</p>
                <Button className="mt-4" variant="outline" onClick={() => void reload()}>Tentar novamente</Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

type SectionProps = {
  data: RegistrationData
  busy: boolean
  mutate: (message: string, operation: (actor: string) => Promise<unknown>) => Promise<boolean>
}

function EnvironmentsSection({ data, busy, mutate }: SectionProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await mutate('Ambiente cadastrado com sucesso.', (actorIdentifier) =>
      registrationsApi.createEnvironment({ code, name, actorIdentifier }))
    if (saved) { setCode(''); setName('') }
  }

  return (
    <TwoColumn title="Novo ambiente" form={<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field label="Código"><input className={fieldClass} value={code} onChange={(event) => setCode(event.target.value)} required maxLength={50} placeholder="PERNAMBUCANAS" /></Field>
      <Field label="Nome"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Pernambucanas" /></Field>
      <Button disabled={busy} type="submit">Salvar ambiente</Button>
    </form>}>
      <SimpleTable headers={['Código', 'Ambiente', 'Situação']} empty="Nenhum ambiente cadastrado.">
        {data.environments.map((item) => <tr key={item.id} className="border-t"><Cell strong>{item.code}</Cell><Cell>{item.name}</Cell><Cell><Status status={item.status} /></Cell></tr>)}
      </SimpleTable>
    </TwoColumn>
  )
}

function SkusSection({ data, busy, mutate }: SectionProps) {
  const [environmentId, setEnvironmentId] = useState(data.environments[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await mutate('SKU cadastrado com sucesso.', (actorIdentifier) =>
      registrationsApi.createSku({ environmentId, code, name, actorIdentifier }))
    if (saved) { setCode(''); setName('') }
  }

  return (
    <TwoColumn title="Novo SKU" form={<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <EnvironmentSelect environments={data.environments} value={environmentId} onChange={setEnvironmentId} />
      <Field label="Código"><input className={fieldClass} value={code} onChange={(event) => setCode(event.target.value)} required maxLength={50} placeholder="RETENCAO" /></Field>
      <Field label="Nome"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Retenção" /></Field>
      <Button disabled={busy || !environmentId} type="submit">Salvar SKU</Button>
    </form>}>
      <SimpleTable headers={['SKU', 'Ambiente', 'Situação']} empty="Nenhum SKU cadastrado.">
        {data.skus.map((item) => <tr key={item.id} className="border-t"><Cell strong>{item.name}</Cell><Cell>{item.environment.name}</Cell><Cell><Status status={item.status} /></Cell></tr>)}
      </SimpleTable>
    </TwoColumn>
  )
}

function SupervisorsSection({ data, busy, mutate }: SectionProps) {
  const [environmentId, setEnvironmentId] = useState(data.environments[0]?.id ?? '')
  const [name, setName] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await mutate('Supervisor cadastrado com sucesso.', (actorIdentifier) =>
      registrationsApi.createSupervisor({ environmentId, name, actorIdentifier }))
    if (saved) setName('')
  }

  return (
    <TwoColumn title="Novo supervisor" form={<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <EnvironmentSelect environments={data.environments} value={environmentId} onChange={setEnvironmentId} />
      <Field label="Nome"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} placeholder="Nome completo" /></Field>
      <Button disabled={busy || !environmentId} type="submit">Salvar supervisor</Button>
    </form>}>
      <SimpleTable headers={['Supervisor', 'Ambiente', 'Situação']} empty="Nenhum supervisor cadastrado.">
        {data.supervisors.map((item) => <tr key={item.id} className="border-t"><Cell strong>{item.name}</Cell><Cell>{item.environment.name}</Cell><Cell><Status status={item.status} /></Cell></tr>)}
      </SimpleTable>
    </TwoColumn>
  )
}

function OperatorsSection({ data, busy, mutate }: SectionProps) {
  const [login, setLogin] = useState('')
  const [name, setName] = useState('')
  const [admissionDate, setAdmissionDate] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await mutate('Operador cadastrado com sucesso.', (actorIdentifier) =>
      registrationsApi.createOperator({ login, name, admissionDate, actorIdentifier }))
    if (saved) { setLogin(''); setName(''); setAdmissionDate('') }
  }
  const toggleStatus = (operator: OperatorRecord) => mutate(
    operator.status === 'ACTIVE' ? 'Operador inativado.' : 'Operador reativado.',
    (actorIdentifier) => registrationsApi.changeOperatorStatus(operator.id, {
      status: operator.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      actorIdentifier,
    }),
  )

  return (
    <TwoColumn title="Novo operador" form={<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field label="Login global"><input className={fieldClass} value={login} onChange={(event) => setLogin(event.target.value)} required maxLength={100} autoComplete="off" /></Field>
      <Field label="Nome"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></Field>
      <Field label="Data de admissão"><input className={fieldClass} type="date" value={admissionDate} onChange={(event) => setAdmissionDate(event.target.value)} required /></Field>
      <Button disabled={busy} type="submit">Salvar operador</Button>
    </form>}>
      <SimpleTable headers={['Operador', 'Login', 'Admissão', 'Situação', '']} empty="Nenhum operador cadastrado.">
        {data.operators.map((item) => <tr key={item.id} className="border-t">
          <Cell strong>{item.name}</Cell><Cell>{item.login}</Cell><Cell>{dateLabel(item.admissionDate)}</Cell><Cell><Status status={item.status} /></Cell>
          <Cell><Button type="button" size="default" variant="ghost" disabled={busy} onClick={() => void toggleStatus(item)}>{item.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}</Button></Cell>
        </tr>)}
      </SimpleTable>
    </TwoColumn>
  )
}

function AssignmentsSection({ data, busy, mutate }: SectionProps) {
  const [operatorId, setOperatorId] = useState(data.operators[0]?.id ?? '')
  const [environmentId, setEnvironmentId] = useState(data.environments[0]?.id ?? '')
  const [skuId, setSkuId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const skus = useMemo(() => data.skus.filter((item) => item.environmentId === environmentId && item.status === 'ACTIVE'), [data.skus, environmentId])
  const supervisors = useMemo(() => data.supervisors.filter((item) => item.environmentId === environmentId && item.status === 'ACTIVE'), [data.supervisors, environmentId])
  const selectedSkuId = skus.some((item) => item.id === skuId) ? skuId : skus[0]?.id ?? ''
  const selectedSupervisorId = supervisors.some((item) => item.id === supervisorId) ? supervisorId : supervisors[0]?.id ?? ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await mutate('Atribuição cadastrada com sucesso.', (actorIdentifier) =>
      registrationsApi.createAssignment({
        operatorId,
        environmentId,
        skuId: selectedSkuId,
        supervisorId: selectedSupervisorId,
        validFrom,
        validTo: validTo || null,
        actorIdentifier,
      }))
    if (saved) { setValidFrom(''); setValidTo('') }
  }

  return (
    <TwoColumn title="Nova atribuição" form={<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field label="Operador"><select className={fieldClass} value={operatorId} onChange={(event) => setOperatorId(event.target.value)} required><option value="">Selecione</option>{data.operators.filter((item) => item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.login}</option>)}</select></Field>
      <EnvironmentSelect environments={data.environments} value={environmentId} onChange={(id) => { setEnvironmentId(id); setSkuId(''); setSupervisorId('') }} />
      <Field label="SKU"><select className={fieldClass} value={selectedSkuId} onChange={(event) => setSkuId(event.target.value)} required><option value="">Selecione</option>{skus.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Supervisor"><select className={fieldClass} value={selectedSupervisorId} onChange={(event) => setSupervisorId(event.target.value)} required><option value="">Selecione</option>{supervisors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Início da vigência"><input className={fieldClass} type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required /></Field><Field label="Fim da vigência (opcional)"><input className={fieldClass} type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} /></Field></div>
      <Button disabled={busy || !operatorId || !environmentId || !selectedSkuId || !selectedSupervisorId} type="submit">Salvar atribuição</Button>
    </form>}>
      <SimpleTable headers={['Operador', 'Ambiente / SKU', 'Supervisor', 'Vigência']} empty="Nenhuma atribuição cadastrada.">
        {data.assignments.map((item) => <tr key={item.id} className="border-t"><Cell strong>{item.operator.name}<span className="block text-xs font-normal text-muted-foreground">{item.operator.login}</span></Cell><Cell>{item.environment.name}<span className="block text-xs text-muted-foreground">{item.sku.name}</span></Cell><Cell>{item.supervisor.name}</Cell><Cell><AssignmentPeriod assignment={item} busy={busy} mutate={mutate} /></Cell></tr>)}
      </SimpleTable>
    </TwoColumn>
  )
}

function AssignmentPeriod({ assignment, busy, mutate }: { assignment: AssignmentRecord; busy: boolean; mutate: SectionProps['mutate'] }) {
  const [endDate, setEndDate] = useState('')
  if (assignment.validTo) return <span>{dateLabel(assignment.validFrom)} a {dateLabel(assignment.validTo)}</span>
  return <div className="min-w-48"><span className="block">Desde {dateLabel(assignment.validFrom)}</span><div className="mt-2 flex gap-2"><input aria-label={`Fim da vigência de ${assignment.operator.name}`} className={`${fieldClass} h-8 min-w-32`} type="date" min={assignment.validFrom.slice(0, 10)} value={endDate} onChange={(event) => setEndDate(event.target.value)} /><Button type="button" variant="outline" disabled={busy || !endDate} onClick={() => void mutate('Vigência encerrada com sucesso.', (actorIdentifier) => registrationsApi.changeAssignmentPeriod(assignment.id, { validTo: endDate, actorIdentifier }))}>Encerrar</Button></div></div>
}

function TwoColumn({ title, form, children }: { title: string; form: ReactNode; children: ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-[minmax(260px,360px)_1fr]"><section className="rounded-2xl border bg-card p-5 shadow-card"><h2 className="mb-5 text-sm font-semibold">{title}</h2>{form}</section><section className="min-w-0 rounded-2xl border bg-card p-5 shadow-card"><h2 className="mb-4 text-sm font-semibold">Cadastros existentes</h2>{children}</section></div>
}

function SimpleTable({ headers, empty, children }: { headers: string[]; empty: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)
  if (!hasRows) return <p className="rounded-xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="pb-2 pr-4 font-medium">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

function Cell({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <td className={`py-3 pr-4 align-top ${strong ? 'font-medium' : ''}`}>{children}</td>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={labelClass}>{label}{children}</label>
}

function EnvironmentSelect({ environments, value, onChange }: { environments: EnvironmentRecord[]; value: string; onChange: (id: string) => void }) {
  return <Field label="Ambiente"><select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Selecione</option>{environments.filter((item) => item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
}

function Status({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${status === 'ACTIVE' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>{status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span>
}

function Feedback({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-success/25 bg-success/5 text-success'}`}>{children}</div>
}

function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}
