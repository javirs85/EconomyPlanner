import { useEffect, useMemo, useRef, useState } from 'react'
import {
  exploreTradeRepublicTransactions,
  getLatestImportedTransactionDate,
  importTradeRepublicCsv,
} from '../../application/importTradeRepublicCsv/importTradeRepublicCsv'
import type {
  ImportBatch,
  RawTradeRepublicTransaction,
  TransactionExplorerMetrics,
} from '../../infrastructure/tradeRepublic/types'
import { formatMoney } from '../../shared/money/formatMoney'
import { MonthlyClosingPanel } from '../components/MonthlyClosingPanel'
import { ClosingCalendar } from '../components/ClosingCalendar'

const emptyMetrics: TransactionExplorerMetrics = {
  movementCount: 0,
  externalIncome: 0,
  cardExpenses: 0,
  invested: 0,
  investmentSales: 0,
  investmentIncome: 0,
  bondMaturities: 0,
  netCashFlow: 0,
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function getPresetRange(preset: string) {
  const today = new Date()
  if (preset === 'month') return { from: isoDate(startOfMonth(today)), to: isoDate(today) }
  if (preset === 'previous') {
    const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return { from: isoDate(previous), to: isoDate(endOfMonth(previous)) }
  }
  if (preset === '30days') {
    const from = new Date(today)
    from.setDate(today.getDate() - 29)
    return { from: isoDate(from), to: isoDate(today) }
  }
  if (preset === 'ytd') return { from: `${today.getFullYear()}-01-01`, to: isoDate(today) }
  if (preset === 'previousYear') return { from: `${today.getFullYear() - 1}-01-01`, to: `${today.getFullYear() - 1}-12-31` }
  return { from: '2000-01-01', to: isoDate(today) }
}

function formatDate(date?: string) {
  if (!date) return undefined
  return new Intl.DateTimeFormat('es-ES').format(new Date(`${date}T00:00:00`))
}

function transactionTone(transaction: RawTradeRepublicTransaction) {
  if (transaction.type === 'BUY' || transaction.type === 'SELL') return 'investment'
  if (transaction.type === 'MIGRATION' || transaction.type === 'FINAL_MATURITY') return 'technical'
  if ((transaction.amount ?? 0) > 0) return 'income'
  if ((transaction.amount ?? 0) < 0) return 'expense'
  return 'technical'
}

function transactionLabel(type?: string) {
  return {
    BENEFITS_SAVEBACK: 'Saveback',
    BUY: 'Compra',
    CARD_TRANSACTION: 'Tarjeta',
    CARD_TRANSACTION_INTERNATIONAL: 'Tarjeta internacional',
    CUSTOMER_INBOUND: 'Entrada externa',
    CUSTOMER_OUTBOUND: 'Retirada externa',
    DIVIDEND: 'Dividendo',
    DIVIDEND_PAYMENT: 'Dividendo',
    FINAL_MATURITY: 'Vencimiento',
    INTEREST_PAYMENT: 'Interés',
    MIGRATION: 'Migración',
    SELL: 'Venta',
    STOCKPERK: 'Stockperk',
    TAX_OPTIMIZATION: 'Ajuste fiscal',
    TRANSFER_INBOUND: 'Transferencia entrante',
    TRANSFER_INSTANT_INBOUND: 'Transferencia entrante',
    TRANSFER_INSTANT_OUTBOUND: 'Transferencia saliente',
  }[type ?? ''] ?? type ?? 'Sin clasificar'
}

const flowLabels: Record<string, string> = {
  externalIncome: 'Entradas externas',
  cardExpenses: 'Gasto cotidiano',
  invested: 'Invertido',
  investmentSales: 'Ventas de inversión',
  investmentIncome: 'Rendimientos recibidos',
  bondMaturities: 'Vencimientos de bonos',
}

const presetLabels: Record<string, string> = {
  month: 'Este mes',
  previous: 'Mes anterior',
  '30days': 'Últimos 30 días',
  ytd: 'YTD',
  previousYear: 'Año anterior',
}

function MetricBar({ active, flow, label, value, max, tone, onClick }: {
  active: boolean
  flow: string
  label: string
  value: number
  max: number
  tone: string
  onClick: (flow: string) => void
}) {
  return (
    <button className={`flow-metric ${active ? 'active' : ''}`} onClick={() => onClick(flow)}>
      <div><span>{label}</span><strong>{formatMoney(value)}</strong></div>
      <div className="flow-track"><span className={tone} style={{ width: `${max ? value / max * 100 : 0}%` }} /></div>
    </button>
  )
}

export function ImportsPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const initialRange = useMemo(() => getPresetRange('ytd'), [])
  const [latestDate, setLatestDate] = useState<string>()
  const [batch, setBatch] = useState<ImportBatch>()
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [activePreset, setActivePreset] = useState('ytd')
  const [investmentsOnly, setInvestmentsOnly] = useState(false)
  const [flow, setFlow] = useState<string>()
  const [transactions, setTransactions] = useState<RawTradeRepublicTransaction[]>([])
  const [metrics, setMetrics] = useState(emptyMetrics)
  const [selected, setSelected] = useState<RawTradeRepublicTransaction>()
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [closingRefresh, setClosingRefresh] = useState(0)
  const [selectedClosingMonth, setSelectedClosingMonth] = useState(() => {
    const today = new Date()
    const target = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
  })
  const [coverageStart, setCoverageStart] = useState('')
  const [coverageEnd, setCoverageEnd] = useState(() => isoDate(new Date()))

  useEffect(() => {
    void getLatestImportedTransactionDate().then((date) => {
      setLatestDate(date)
      if (date) setCoverageStart((current) => current || date)
    })
  }, [])

  useEffect(() => {
    let ignore = false
    void exploreTradeRepublicTransactions({ from, to, investmentsOnly, flow })
      .then((result) => {
        if (ignore) return
        setTransactions(result.transactions)
        setMetrics(result.metrics)
        setSelected(undefined)
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los movimientos.')
      })

    return () => { ignore = true }
  }, [flow, from, investmentsOnly, to])

  function applyPreset(preset: string) {
    const range = getPresetRange(preset)
    setActivePreset(preset)
    setFrom(range.from)
    setTo(range.to)
  }

  async function consumeFile(file?: File) {
    if (!file) return
    setLoading(true)
    setError(undefined)
    try {
      if (!coverageStart || !coverageEnd) throw new Error('Indica el rango solicitado a Trade Republic antes de importar.')
      const importedBatch = await importTradeRepublicCsv(file, coverageStart, coverageEnd)
      setBatch(importedBatch)
      const latestImportedDate = await getLatestImportedTransactionDate()
      setLatestDate(latestImportedDate)
      if (latestImportedDate) setCoverageStart(latestImportedDate)
      setClosingRefresh((current) => current + 1)
      const result = await exploreTradeRepublicTransactions({ from, to, investmentsOnly, flow })
      setTransactions(result.transactions)
      setMetrics(result.metrics)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo importar el CSV.')
    } finally {
      setLoading(false)
    }
  }

  const maxFlow = Math.max(metrics.externalIncome, metrics.cardExpenses, metrics.invested, metrics.investmentSales, metrics.investmentIncome, metrics.bondMaturities)
  const hasDateFilter = activePreset !== 'all'
  const dateFilterLabel = activePreset ? presetLabels[activePreset] : `${formatDate(from)} → ${formatDate(to)}`
  const hasActiveFilters = hasDateFilter || investmentsOnly || flow

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Trade Republic</p><h1>Movimientos importados</h1><p>Revisa el historial y entiende qué ha ocurrido en cada periodo.</p></div>
      </header>

      <ClosingCalendar onSelect={setSelectedClosingMonth} refreshKey={closingRefresh} selectedMonth={selectedClosingMonth} />
      <MonthlyClosingPanel month={selectedClosingMonth} onSaved={() => setClosingRefresh((current) => current + 1)} refreshKey={closingRefresh} />

      <section className="panel import-strip">
        <div>
          <p className="eyebrow">Próxima exportación recomendada</p>
          <h2>{latestDate ? `${formatDate(latestDate)} → hoy` : 'Elige cualquier fecha inicial'}</h2>
          <p>{latestDate ? 'Repetir el último día es seguro: los duplicados se ignoran.' : 'Todavía no hay movimientos almacenados.'}</p>
          <div className="coverage-inputs">
            <label>Desde<input type="date" value={coverageStart} onChange={(event) => setCoverageStart(event.target.value)} /></label>
            <label>Hasta<input type="date" value={coverageEnd} onChange={(event) => setCoverageEnd(event.target.value)} /></label>
          </div>
        </div>
        <div
          className={`compact-dropzone ${dragging ? 'dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void consumeFile(event.dataTransfer.files[0]) }}
        >
          <input accept=".csv,text/csv" onChange={(event) => void consumeFile(event.target.files?.[0])} ref={inputRef} type="file" />
          <span>⇣</span><div><strong>{loading ? 'Procesando CSV…' : 'Arrastra el CSV aquí'}</strong><small>o elige el archivo manualmente</small></div>
          <button className="secondary-button" disabled={loading} onClick={() => inputRef.current?.click()}>Elegir CSV</button>
        </div>
      </section>

      {error && <p className="import-error">{error}</p>}
      {batch && <p className="batch-notice">Importación completada: {batch.summary.insertedCount} nuevas y {batch.summary.duplicateCount} duplicadas. Guardado en SQLite local.</p>}

      <section className="panel explorer-filters">
        <div className="preset-row">
          {[
            ['month', 'Este mes'],
            ['previous', 'Mes anterior'],
            ['30days', 'Últimos 30 días'],
            ['ytd', 'YTD'],
            ['previousYear', 'Año anterior'],
            ['all', 'Todo'],
          ].map(([value, label]) => <button className={activePreset === value ? 'active' : ''} key={value} onClick={() => applyPreset(value)}>{label}</button>)}
        </div>
        <div className="manual-range">
          <label>Desde<input type="date" value={from} onChange={(event) => { setActivePreset(''); setFrom(event.target.value) }} /></label>
          <label>Hasta<input type="date" value={to} onChange={(event) => { setActivePreset(''); setTo(event.target.value) }} /></label>
          <button className={`investment-toggle ${investmentsOnly ? 'active' : ''}`} onClick={() => setInvestmentsOnly((current) => !current)}>
            {investmentsOnly ? '✓ ' : ''}Solo inversiones
          </button>
        </div>
      </section>

      <section className="explorer-layout">
        <article className="panel movements-panel">
          <div className="movements-heading">
            <div>
              <p className="eyebrow">Selección actual</p>
              <h2>{metrics.movementCount} movimientos</h2>
              {hasActiveFilters && (
                <div className="table-active-filters">
                  <span>Filtrado por</span>
                  {hasDateFilter && <button onClick={() => applyPreset('all')}>{dateFilterLabel} ×</button>}
                  {investmentsOnly && <button onClick={() => setInvestmentsOnly(false)}>Solo inversiones ×</button>}
                  {flow && <button onClick={() => setFlow(undefined)}>{flowLabels[flow]} ×</button>}
                  <button className="clear-filters" onClick={() => { applyPreset('all'); setInvestmentsOnly(false); setFlow(undefined) }}>Limpiar</button>
                </div>
              )}
            </div>
            <small>{formatDate(from)} → {formatDate(to)}</small>
          </div>
          <div className="movements-table-wrap">
            <table className="movements-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Activo</th><th>Importe</th></tr></thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr className={selected?.transactionId === transaction.transactionId ? 'selected' : ''} key={transaction.transactionId} onClick={() => setSelected(transaction)}>
                    <td>{formatDate(transaction.date)}</td>
                    <td><span className={`movement-chip ${transactionTone(transaction)}`}>{transactionLabel(transaction.type)}</span></td>
                    <td>{transaction.name || transaction.description || '—'}</td>
                    <td>{transaction.symbol || transaction.assetClass || '—'}</td>
                    <td className={(transaction.amount ?? 0) > 0 ? 'amount-positive' : ''}>{transaction.amount === undefined ? '—' : formatMoney(transaction.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && <p className="empty-state">No hay movimientos para esta selección.</p>}
          </div>
        </article>

        <aside className="explorer-side">
          <article className="panel flow-panel">
            <p className="eyebrow">Flujos de la selección</p><h2>Qué ha pasado</h2>
            <div className="flow-list">
              <MetricBar active={flow === 'externalIncome'} flow="externalIncome" label="Entradas externas" value={metrics.externalIncome} max={maxFlow} tone="income" onClick={(selectedFlow) => setFlow(flow === selectedFlow ? undefined : selectedFlow)} />
              <MetricBar active={flow === 'cardExpenses'} flow="cardExpenses" label="Gasto cotidiano" value={metrics.cardExpenses} max={maxFlow} tone="expense" onClick={(selectedFlow) => setFlow(flow === selectedFlow ? undefined : selectedFlow)} />
              <MetricBar active={flow === 'invested'} flow="invested" label="Invertido" value={metrics.invested} max={maxFlow} tone="investment" onClick={(selectedFlow) => setFlow(flow === selectedFlow ? undefined : selectedFlow)} />
              <MetricBar active={flow === 'investmentSales'} flow="investmentSales" label="Ventas de inversión" value={metrics.investmentSales} max={maxFlow} tone="technical" onClick={(selectedFlow) => setFlow(flow === selectedFlow ? undefined : selectedFlow)} />
              <MetricBar active={flow === 'investmentIncome'} flow="investmentIncome" label="Rendimientos recibidos" value={metrics.investmentIncome} max={maxFlow} tone="yield" onClick={(selectedFlow) => setFlow(flow === selectedFlow ? undefined : selectedFlow)} />
              <MetricBar active={flow === 'bondMaturities'} flow="bondMaturities" label="Vencimientos de bonos" value={metrics.bondMaturities} max={maxFlow} tone="maturity" onClick={(selectedFlow) => setFlow(flow === selectedFlow ? undefined : selectedFlow)} />
            </div>
            <div className="net-flow"><span>Flujo neto de cash</span><strong>{formatMoney(metrics.netCashFlow)}</strong></div>
          </article>

          {selected && (
            <article className="panel raw-panel">
              <div className="raw-heading"><div><p className="eyebrow">Detalle del movimiento</p><h2>{transactionLabel(selected.type)}</h2></div><button onClick={() => setSelected(undefined)}>×</button></div>
              <dl>{Object.entries(selected.raw).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
            </article>
          )}
        </aside>
      </section>
    </>
  )
}
