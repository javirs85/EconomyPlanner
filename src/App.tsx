import { useEffect, useState } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from 'recharts'
import type { CSSProperties } from 'react'
import {
  getDashboard,
  type DashboardResult,
} from './application/dashboardQueries/dashboard'
import type { IncomeBreakdownItem, MonthlyOriginStack } from './domain/snapshots/types'
import { formatMoney } from './shared/money/formatMoney'
import { GeneratedReturnsChart, NetWorthChart } from './ui/charts/NetWorthChart'
import { ImportsPage } from './ui/pages/ImportsPage'
import { HistoricalMigrationPage } from './ui/pages/HistoricalMigrationPage'
import './App.css'

const stackLegend = [
  { label: 'Inmobiliario aportado', detail: 'Capital bloqueado en Urbanitae', color: '#c48a67' },
  { label: 'Invertido generado', detail: 'Crecimiento combinado de las inversiones', color: '#a5d2b7' },
  { label: 'Invertido aportado', detail: 'Principal vivo en RV y cripto', color: '#3f7b5e' },
  { label: 'Renta fija', detail: 'Valor actual invertido en RF', color: '#8d9692' },
  { label: 'Cash generado', detail: 'Intereses y cupones', color: '#86b6db' },
  { label: 'Cash aportado', detail: 'Liquidez para el día a día', color: '#2f5f91' },
]

const assetColors: Record<string, string> = {
  caixaCash: '#2d6f9f',
  tradeRepublicCash: '#4f8fb5',
  tradeRepublicEquity: '#3c7d57',
  myInvestorEquity: '#5e9f72',
  tradeRepublicFixedIncome: '#7a8582',
  myInvestorFixedIncome: '#a8b1ad',
  tradeRepublicCrypto: '#73559d',
  myInvestorCrypto: '#9070b7',
  criptanCrypto: '#b19ad0',
  urbanitaeRealEstate: '#c48a67',
}

const incomeColors: Record<string, string> = {
  investmentIncome: '#579074',
  interestPayments: '#579074',
  dividendPayments: '#78a98d',
  benefitPayments: '#93b7a2',
  bondMaturities: '#b3a27c',
  reportedInterest: '#579074',
  reportedBondPayments: '#b3a27c',
  otherGeneratedCash: '#8aa9b7',
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? '+' : ''}${formatMoney(value)}`
}

function snapshotOriginLabel(snapshot: MonthlyOriginStack) {
  if (snapshot.snapshotOrigin === 'historical-visual') return 'Histórico visual'
  if (snapshot.snapshotOrigin === 'baseline') return 'Baseline fiable'
  return 'Seguimiento real'
}

function MetricCard({ eyebrow, value, detail, tone = 'default' }: {
  eyebrow: string
  value: string
  detail: string
  tone?: 'default' | 'positive'
}) {
  return (
    <article className="metric-card">
      <p>{eyebrow}</p>
      <strong className={tone === 'positive' ? 'positive' : ''}>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

function PassiveIncomeCard({ month, value, ytd }: { month: string; value: number; ytd: number }) {
  return (
    <article className="metric-card passive-income-card">
      <p>Ingresos pasivos</p>
      <div className="passive-income-inline">
        <div><strong>{formatMoney(value)}</strong><span>{month}</span></div>
        <div><strong>{formatMoney(ytd)}</strong><span>YTD</span></div>
      </div>
    </article>
  )
}

function AssetPieCard({ snapshot }: { snapshot: MonthlyOriginStack }) {
  const [activeAssetKey, setActiveAssetKey] = useState<string>()
  const visibleAssets = snapshot.assetBreakdown.filter((asset) => asset.value > 0)

  return (
    <article className="panel selected-allocation-card" onMouseLeave={() => setActiveAssetKey(undefined)}>
      <div className="card-heading compact"><div><p className="eyebrow">Distribución seleccionada</p><h2>{formatMonth(snapshot.month)}</h2><span className={`origin-pill ${snapshot.snapshotOrigin}`}>{snapshotOriginLabel(snapshot)}</span></div><strong>{formatMoney(snapshot.totalNetWorth)}</strong></div>
      <div className="selected-allocation-body">
        <div className="selected-pie-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={visibleAssets}
                dataKey="value"
                innerRadius="40%"
                nameKey="label"
                onMouseEnter={(_, index) => setActiveAssetKey(visibleAssets[index]?.key)}
                outerRadius="96%"
                paddingAngle={2}
                stroke="none"
              >
                {visibleAssets.map((asset) => <Cell key={asset.key} fill={assetColors[asset.key]} opacity={!activeAssetKey || activeAssetKey === asset.key ? 1 : 0.42} stroke="none" />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="asset-legend-large">
          {visibleAssets.map((asset) => {
            const percent = snapshot.totalNetWorth ? asset.value / snapshot.totalNetWorth * 100 : 0
            return (
              <button
                className={activeAssetKey === asset.key ? 'active' : undefined}
                key={asset.key}
                onFocus={() => setActiveAssetKey(asset.key)}
                onMouseEnter={() => setActiveAssetKey(asset.key)}
                style={{ '--asset-color': assetColors[asset.key] } as CSSProperties}
                type="button"
              >
                <span className="legend-swatch" style={{ backgroundColor: assetColors[asset.key] }} />
                <p>{asset.label}{asset.category !== 'cash' && asset.principal !== undefined && <small>Aportado {formatMoney(asset.principal)} · Crec. {formatMoney(asset.growth ?? 0)}</small>}</p>
                <strong>{formatMoney(asset.value)}<small>{percent.toFixed(1)}%</small></strong>
              </button>
            )
          })}
        </div>
      </div>
    </article>
  )
}

function IncomeRow({ item, max }: { item: IncomeBreakdownItem; max: number }) {
  const width = max ? item.value / max * 100 : 0
  return (
    <div className="income-row">
      <div><span>{item.label}</span><strong>{formatMoney(item.value)}</strong></div>
      <div className="income-track"><span style={{ width: `${width}%`, backgroundColor: incomeColors[item.key] }} /></div>
    </div>
  )
}

function IncomeBreakdownCard({ snapshot }: { snapshot: MonthlyOriginStack }) {
  const items = snapshot.incomeBreakdown.items.filter((item) => item.value > 0)
  const max = Math.max(...items.map((item) => item.value), 0)
  const sourceLabel = snapshot.incomeBreakdown.source === 'snapshot'
    ? 'Guardado en snapshot'
    : snapshot.incomeBreakdown.source === 'csv'
      ? 'Detectado en CSV'
      : 'Fallback manual'

  return (
    <article className="panel income-card">
      <div className="card-heading compact"><div><p className="eyebrow">Recibido</p><h2>Desglose de pagos</h2></div><strong>{formatMoney(snapshot.incomeBreakdown.total)}</strong></div>
      <div className="income-source">{sourceLabel} · {snapshot.incomeBreakdown.coverageStatus}</div>
      <p className="income-note">La barra usa cash generado atribuido al cierre; aquí se muestran pagos recibidos por tipo.</p>
      <div className="income-bars">
        {items.length > 0
          ? items.map((item) => <IncomeRow key={item.key} item={item} max={max} />)
          : <p className="empty-state compact-empty">Sin ingresos recibidos en este periodo.</p>}
      </div>
    </article>
  )
}

function SelectedKpisCard({ snapshot }: { snapshot: MonthlyOriginStack }) {
  const hasChange = snapshot.monthlyChange !== undefined && snapshot.monthlyChangePercent !== undefined
  const savings = snapshot.savingsBreakdown

  return (
    <article className="panel selected-kpis-card">
      <div className="selected-kpi">
        <span>Capital del mes</span>
        <strong>{formatMoney(snapshot.totalNetWorth)}</strong>
      </div>
      <div className="selected-kpi">
        <span>Cambio vs anterior</span>
        <strong className={snapshot.monthlyChange !== undefined && snapshot.monthlyChange >= 0 ? 'positive' : undefined}>{hasChange ? formatSignedMoney(snapshot.monthlyChange!) : 'Pendiente'}</strong>
        {hasChange && <small>{snapshot.monthlyChangePercent! >= 0 ? '+' : ''}{snapshot.monthlyChangePercent!.toFixed(2)}%</small>}
      </div>
      <div className="selected-kpi savings-kpi">
        <span>Ahorro enviado</span>
        <strong>{formatSignedMoney(savings.total)}</strong>
        <div>
          <small>MI {formatSignedMoney(savings.myInvestor)}</small>
          <small>Criptan {formatSignedMoney(savings.criptan)}</small>
          <small>Urbanitae {formatSignedMoney(savings.urbanitae)}</small>
        </div>
      </div>
    </article>
  )
}

function Dashboard({ onOpenClosing }: { onOpenClosing: () => void }) {
  const [dashboard, setDashboard] = useState<DashboardResult>()
  const [error, setError] = useState<string>()
  const [selectedPeriodEnd, setSelectedPeriodEnd] = useState<string>()

  useEffect(() => {
    void getDashboard()
      .then((result) => {
        setDashboard(result)
        setSelectedPeriodEnd((current) => current ?? result.snapshots.at(-1)?.periodEnd)
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'No se pudo cargar el dashboard.'))
  }, [])

  if (error) return <section className="panel dashboard-empty"><h1>No se pudo cargar el resumen</h1><p>{error}</p></section>
  if (!dashboard) return <section className="panel dashboard-empty"><p>Cargando datos reales...</p></section>
  if (!dashboard.summary) {
    return (
      <section className="panel dashboard-empty">
        <p className="eyebrow">Vista general</p>
        <h1>Aún no hay cierres mensuales</h1>
        <p>Completa tu primer cierre para empezar a construir el histórico real.</p>
        <button className="primary-button" onClick={onOpenClosing}>Crear primer cierre</button>
      </section>
    )
  }

  const { snapshots, summary } = dashboard
  const latestMonth = formatMonth(summary.latestMonth)
  const hasComparison = summary.monthlyChange !== undefined && summary.monthlyChangePercent !== undefined
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.periodEnd === selectedPeriodEnd) ?? snapshots.at(-1)!

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Vista general</p><h1>Tu patrimonio financiero</h1><p>Resumen basado en tus cierres guardados en SQLite.</p></div>
        <button className="primary-button" onClick={onOpenClosing}>+ Añadir cierre</button>
      </header>

      <section className="metrics-grid" aria-label="Resumen del mes">
        <MetricCard eyebrow="Patrimonio actual" value={formatMoney(summary.currentNetWorth)} detail={`Último cierre · ${latestMonth}`} />
        <MetricCard eyebrow="Cambio este mes" value={hasComparison ? `${summary.monthlyChange! >= 0 ? '+' : ''}${formatMoney(summary.monthlyChange!)}` : 'Pendiente'} detail={hasComparison ? `${summary.monthlyChangePercent! >= 0 ? '+' : ''}${summary.monthlyChangePercent!.toFixed(2)}% vs cierre anterior` : 'Necesitamos dos cierres para comparar'} tone={summary.monthlyChange !== undefined && summary.monthlyChange >= 0 ? 'positive' : 'default'} />
        <MetricCard eyebrow="Cambio por mercado" value={summary.marketChange === undefined ? 'Pendiente' : formatSignedMoney(summary.marketChange)} detail={summary.marketChange === 0 && summary.latestMonth === '2026-05' ? 'Baseline de partida' : 'RV y cripto sin aportaciones'} tone={summary.marketChange !== undefined && summary.marketChange >= 0 ? 'positive' : 'default'} />
        <PassiveIncomeCard month={latestMonth} value={summary.passiveIncome} ytd={summary.passiveIncomeYtd} />
      </section>

      <section className="chart-card">
        <div className="card-heading">
          <div><p className="eyebrow">Evolución mensual real</p><h2>Dónde está tu patrimonio</h2><p>Los cierres guardados alimentan este gráfico. El histórico anterior a mayo de 2026 parte de una estimación del 10% de revalorización.</p></div>
        </div>
        <div className="chart-layout">
          <div className="chart-main-column">
            <div className="chart-area"><NetWorthChart data={snapshots} selectedPeriodEnd={selectedSnapshot.periodEnd} onSelectSnapshot={(snapshot) => setSelectedPeriodEnd(snapshot.periodEnd)} /></div>
            <div className="returns-chart-heading"><span>Beneficios acumulados y realizados</span><i /><b>Invertido generado</b><i /><b>Cash generado</b></div>
            <div className="returns-chart-area"><GeneratedReturnsChart data={snapshots} /></div>
          </div>
          <div className="stack-legend">{stackLegend.map((item) => <div className="legend-row" key={item.label}><span className="legend-swatch" style={{ backgroundColor: item.color }} /><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>)}</div>
        </div>
      </section>

      <section className="selected-analytics-grid">
        <AssetPieCard snapshot={selectedSnapshot} />
        <div className="selected-analytics-side">
          <IncomeBreakdownCard snapshot={selectedSnapshot} />
          <SelectedKpisCard snapshot={selectedSnapshot} />
        </div>
      </section>
    </>
  )
}

function App() {
  const [page, setPage] = useState<'dashboard' | 'imports' | 'history'>(() => window.location.hash === '#imports' ? 'imports' : window.location.hash === '#history' ? 'history' : 'dashboard')

  function navigate(nextPage: 'dashboard' | 'imports' | 'history') {
    setPage(nextPage)
    window.location.hash = nextPage
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R</span><div><strong>Renta</strong><small>Patrimonio familiar</small></div></div>
        <nav aria-label="Navegación principal">
          <a className={page === 'dashboard' ? 'active' : ''} href="#dashboard" onClick={() => navigate('dashboard')}><span>⌂</span>Resumen</a>
          <a className={page === 'imports' ? 'active' : ''} href="#imports" onClick={() => navigate('imports')}><span>⇣</span>Cierres e importaciones</a>
          <a className={page === 'history' ? 'active' : ''} href="#history" onClick={() => navigate('history')}><span>↻</span>Migración histórica</a>
        </nav>
        <div className="sidebar-foot"><p>Base SQLite local</p><small>Persistente. Sin nube.</small></div>
      </aside>
      <main id={page}>{page === 'imports' ? <ImportsPage /> : page === 'history' ? <HistoricalMigrationPage /> : <Dashboard onOpenClosing={() => navigate('imports')} />}</main>
    </div>
  )
}

export default App
