import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ClipboardPenLine, Database, Download, FileCheck2, LayoutDashboard, Settings, Upload, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Seo } from '@/components/Seo'
import { LogoutButton } from '@/components/LogoutButton'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import {
  commitValidatedImport,
  ImportApiError,
  importTemplateUrl,
  loadImportHistory,
  validateImport,
  type ImportBatchRecord,
  type ImportKind,
  type ImportPreview,
} from '@/lib/imports-api'

const fieldClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50'

export function ImportsPage() {
  const { user } = useAuth()
  const [type, setType] = useState<ImportKind>('OPERATORS')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const actorIdentifier = user?.email ?? ''
  const [confirmOperatorUpdates, setConfirmOperatorUpdates] = useState(false)
  const [confirmResultReplacements, setConfirmResultReplacements] = useState(false)
  const [history, setHistory] = useState<ImportBatchRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reloadHistory = useCallback(async () => {
    try {
      setHistory(await loadImportHistory())
    } catch (cause) {
      setError(messageFrom(cause))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadImportHistory()
      .then((records) => { if (!cancelled) setHistory(records) })
      .catch((cause: unknown) => { if (!cancelled) setError(messageFrom(cause)) })
    return () => { cancelled = true }
  }, [])

  const chooseType = (nextType: ImportKind) => {
    setType(nextType)
    setFile(null)
    setPreview(null)
    setError(null)
    setNotice(null)
    setConfirmOperatorUpdates(false)
    setConfirmResultReplacements(false)
  }

  const validate = async () => {
    if (!file) {
      setError('Selecione um arquivo Excel ou CSV.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await validateImport(file, type)
      setPreview(result)
      setConfirmOperatorUpdates(false)
      setConfirmResultReplacements(false)
      if (result.issues.length > 0) setError('O arquivo contém erros. Nenhum registro foi gravado.')
      else setNotice('Arquivo validado. Revise a prévia antes de confirmar a importação.')
    } catch (cause) {
      setPreview(cause instanceof ImportApiError ? cause.preview ?? null : null)
      setError(messageFrom(cause))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!file || !preview || preview.issues.length > 0) return
    if (preview.requiresOperatorUpdateConfirmation && !confirmOperatorUpdates) {
      setError('Confirme as atualizações de operadores indicadas na prévia.')
      return
    }
    if (preview.requiresResultReplacementConfirmation && !confirmResultReplacements) {
      setError('Confirme a substituição dos quatro indicadores existentes.')
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const batch = await commitValidatedImport({
        file,
        preview,
        actorIdentifier: actorIdentifier.trim(),
        confirmOperatorUpdates,
        confirmResultReplacements,
      })
      setNotice(`Lote ${batch.id} concluído: ${batch.acceptedRows} linha(s) processada(s).`)
      setFile(null)
      setPreview(null)
      setConfirmOperatorUpdates(false)
      setConfirmResultReplacements(false)
      await reloadHistory()
    } catch (cause) {
      if (cause instanceof ImportApiError && cause.preview) setPreview(cause.preview)
      setError(messageFrom(cause))
      await reloadHistory()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Seo title="Importações · Indica" description="Importação validada de operadores e resultados operacionais." />
      <Sidebar />

      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Persistência operacional</p>
            <h1 className="text-2xl font-semibold">Importação de planilhas</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Valide o arquivo inteiro, revise inclusões e substituições e confirme antes de qualquer gravação.
            </p>
          </div>
          <Button asChild variant="outline"><Link to="/painel"><LayoutDashboard /> Voltar ao painel</Link></Button>
        </div>

        <section className="mt-6 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={type === 'OPERATORS' ? 'default' : 'outline'} onClick={() => chooseType('OPERATORS')}>Operadores e atribuições</Button>
            <Button type="button" variant={type === 'RESULTS' ? 'default' : 'outline'} onClick={() => chooseType('RESULTS')}>Resultados diários</Button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
              Arquivo Excel ou CSV
              <input
                className={`${fieldClass} py-2`}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setPreview(null)
                  setError(null)
                  setNotice(null)
                }}
              />
            </label>
            <Button type="button" disabled={busy || !file} onClick={() => void validate()}><FileCheck2 /> Validar arquivo</Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Modelos oficiais:</span>
            <a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 hover:bg-muted" href={importTemplateUrl(type, 'xlsx')}><Download className="h-3.5 w-3.5" /> Excel</a>
            <a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 hover:bg-muted" href={importTemplateUrl(type, 'csv')}><Download className="h-3.5 w-3.5" /> CSV</a>
            <span>Datas: AAAA-MM-DD. Percentuais: 0 a 100. TMA: minutos ou MM:SS.</span>
          </div>

          {error && <Feedback tone="error">{error}</Feedback>}
          {notice && <Feedback tone="success">{notice}</Feedback>}
        </section>

        {preview && <Preview
          preview={preview}
          confirmOperatorUpdates={confirmOperatorUpdates}
          setConfirmOperatorUpdates={setConfirmOperatorUpdates}
          confirmResultReplacements={confirmResultReplacements}
          setConfirmResultReplacements={setConfirmResultReplacements}
          busy={busy}
          onCommit={() => void commit()}
        />}

        <History batches={history} />
      </main>
    </div>
  )
}

function Preview(props: {
  preview: ImportPreview
  confirmOperatorUpdates: boolean
  setConfirmOperatorUpdates: (value: boolean) => void
  confirmResultReplacements: boolean
  setConfirmResultReplacements: (value: boolean) => void
  busy: boolean
  onCommit: () => void
}) {
  const valid = props.preview.issues.length === 0
  return (
    <section className="mt-6 rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Prévia do lote</h2>
          <p className="mt-1 text-xs text-muted-foreground">{props.preview.fileName}{props.preview.scope ? ` · ${props.preview.scope.environmentName}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Stat label="Linhas" value={props.preview.totalRows} />
          <Stat label="Válidas" value={props.preview.validRows} tone="success" />
          <Stat label="Com erro" value={props.preview.invalidRows} tone={props.preview.invalidRows ? 'error' : undefined} />
        </div>
      </div>

      {props.preview.issues.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Linha</th><th className="pb-2">Coluna</th><th className="pb-2">Código</th><th className="pb-2">Erro</th></tr></thead>
            <tbody>{props.preview.issues.map((item, index) => <tr key={`${item.lineNumber}-${item.code}-${index}`} className="border-t"><td className="py-3">{item.lineNumber}</td><td>{item.fieldName ?? 'arquivo'}</td><td className="font-mono text-xs">{item.code}</td><td className="text-destructive">{item.message}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Linha</th><th className="pb-2">Chave</th><th className="pb-2">Ação</th><th className="pb-2">Resumo</th></tr></thead>
            <tbody>{props.preview.rows.map((row) => <tr key={row.lineNumber} className="border-t"><td className="py-3">{row.lineNumber}</td><td className="font-medium">{row.key}</td><td><Action value={row.action} /></td><td className="text-muted-foreground">{row.summary}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {valid && <div className="mt-5 grid gap-4 rounded-xl bg-muted/60 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="grid gap-3">
          {props.preview.requiresOperatorUpdateConfirmation && <Confirm checked={props.confirmOperatorUpdates} onChange={props.setConfirmOperatorUpdates}>Confirmo a atualização de nome e/ou admissão dos operadores indicados.</Confirm>}
          {props.preview.requiresResultReplacementConfirmation && <Confirm checked={props.confirmResultReplacements} onChange={props.setConfirmResultReplacements}>Confirmo a substituição integral dos quatro indicadores existentes.</Confirm>}
        </div>
        <Button type="button" disabled={props.busy} onClick={props.onCommit}><Database /> Confirmar e gravar</Button>
      </div>}
    </section>
  )
}

function History({ batches }: { batches: ImportBatchRecord[] }) {
  return <section className="mt-6 rounded-2xl border bg-card p-4 shadow-card sm:p-5"><h2 className="text-base font-semibold">Histórico de importações</h2>{batches.length === 0 ? <p className="mt-4 rounded-xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">Nenhum lote registrado.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2">Início</th><th className="pb-2">Arquivo</th><th className="pb-2">Tipo</th><th className="pb-2">Ambiente</th><th className="pb-2">Status</th><th className="pb-2">Processadas</th><th className="pb-2">Erros</th><th className="pb-2">Responsável</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id} className="border-t"><td className="py-3">{dateTimeLabel(batch.startedAt)}</td><td className="font-medium">{batch.originalFileName}</td><td>{batch.type === 'OPERATORS' ? 'Operadores' : 'Resultados'}</td><td>{batch.environment.name}</td><td><Status status={batch.status} /></td><td>{batch.acceptedRows}/{batch.totalRows}</td><td>{batch.errors.length || batch.rejectedRows}</td><td>{batch.actorIdentifier}</td></tr>)}</tbody></table></div>}</section>
}

function Sidebar() {
  return <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar p-5 md:flex"><Logo /><nav aria-label="Menu do painel" className="mt-10 space-y-1 text-sm font-medium"><MenuLink to="/painel" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</MenuLink><MenuLink to="/cadastros" icon={<Users className="h-4 w-4" />}>Operadores</MenuLink><MenuLink to="/resultados" icon={<ClipboardPenLine className="h-4 w-4" />}>Registro diário</MenuLink><div aria-current="page" className="flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-2.5 text-sidebar-accent-foreground"><Upload className="h-4 w-4" /> Uploads</div><div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground"><Settings className="h-4 w-4" /> Configurar indicadores</div></nav><LogoutButton /></aside>
}

function MenuLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return <Link to={to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">{icon}{children}</Link>
}

function Confirm({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> <span>{children}</span></label>
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'error' }) {
  const style = tone === 'success' ? 'bg-success/10 text-success' : tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
  return <span className={`rounded-lg px-3 py-2 ${style}`}><strong>{value}</strong> {label}</span>
}

function Action({ value }: { value: ImportPreview['rows'][number]['action'] }) {
  const labels = { CREATE: 'Criar', UPDATE: 'Atualizar', REPLACE: 'Substituir', UNCHANGED: 'Sem alteração' }
  return <span className="inline-flex rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">{labels[value]}</span>
}

function Status({ status }: { status: ImportBatchRecord['status'] }) {
  const label = status === 'COMPLETED' ? 'Concluído' : status === 'FAILED' ? 'Falhou' : status === 'VALIDATING' ? 'Validando' : 'Pendente'
  const style = status === 'COMPLETED' ? 'bg-success/10 text-success' : status === 'FAILED' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning-foreground'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${style}`}>{label}</span>
}

function Feedback({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-success/25 bg-success/5 text-success'}`}>{children}</div>
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}
