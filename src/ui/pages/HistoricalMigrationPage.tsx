import { useMemo, useState } from 'react'
import {
  parseHistoricalPaste,
  type HistoricalPreview,
} from '../../application/historicalMigration/parseHistoricalPaste'
import { formatMoney } from '../../shared/money/formatMoney'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-ES').format(new Date(`${date}T00:00:00`))
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
}

function MigrationSummary({ preview }: { preview: HistoricalPreview }) {
  return (
    <section className="migration-summary">
      <div><small>Filas con fecha</small><strong>{preview.sourceRowCount}</strong></div>
      <div><small>Meses conservados</small><strong>{preview.selectedRowCount}</strong></div>
      <div><small>Filas sustituidas</small><strong>{preview.ignoredRowCount}</strong></div>
      <div><small>Regla aplicada</small><strong>Última fila del mes</strong></div>
    </section>
  )
}

export function HistoricalMigrationPage() {
  const [text, setText] = useState('')
  const [tradeRepublicEquityAdjustmentsText, setTradeRepublicEquityAdjustmentsText] = useState('')
  const [preview, setPreview] = useState<HistoricalPreview>()
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: string[], updated: string[], skipped: string[] }>()
  const [adjustmentResult, setAdjustmentResult] = useState<{ updated: string[], missing: string[], skipped: string[] }>()
  const mismatches = useMemo(() => preview?.rows.filter((row) => Math.abs(row.difference) > 0.05) ?? [], [preview])
  const adjustedRows = useMemo(() => preview?.rows.filter((row) => row.tradeRepublicEquityAdjustmentValue !== undefined) ?? [], [preview])

  function generatePreview() {
    try {
      setPreview(parseHistoricalPaste(text, tradeRepublicEquityAdjustmentsText))
      setError(undefined)
      setImportResult(undefined)
      setAdjustmentResult(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo interpretar la tabla.')
    }
  }

  async function importHistoricalRows() {
    setSaving(true)
    setError(undefined)
    try {
      const response = await fetch('/api/historical-migration/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tradeRepublicEquityAdjustmentsText }),
      })
      const result = await response.json() as { imported?: string[], updated?: string[], skipped?: string[], error?: string }
      if (!response.ok || result.error) throw new Error(result.error ?? 'No se pudo guardar la migración histórica.')
      setImportResult({ imported: result.imported ?? [], updated: result.updated ?? [], skipped: result.skipped ?? [] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la migración histórica.')
    } finally {
      setSaving(false)
    }
  }

  async function applyTradeRepublicEquityAdjustments() {
    setSaving(true)
    setError(undefined)
    try {
      const response = await fetch('/api/historical-migration/tr-equity-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeRepublicEquityAdjustmentsText }),
      })
      const result = await response.json() as { updated?: string[], missing?: string[], skipped?: string[], error?: string }
      if (!response.ok || result.error) throw new Error(result.error ?? 'No se pudieron aplicar los ajustes TR RV.')
      setAdjustmentResult({ updated: result.updated ?? [], missing: result.missing ?? [], skipped: result.skipped ?? [] })
      setImportResult(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron aplicar los ajustes TR RV.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Herramienta temporal</p><h1>Migración histórica</h1><p>Pega la hoja antigua y revisa cómo quedaría normalizada antes de guardar snapshots.</p></div>
      </header>

      <section className="panel migration-paste">
        <div><p className="eyebrow">Paso 1</p><h2>Pega la tabla exportada desde Excel</h2><p>Los vacíos se interpretan como cero. Si hay varias filas en un mes, conservaremos la última.</p></div>
        <textarea onChange={(event) => setText(event.target.value)} placeholder="Pega aquí cabecera y filas separadas por tabulaciones..." value={text} />
        <div><p className="eyebrow">Opcional</p><h2>Ajustes TR RV beneficio</h2><p>Pega month,trRvValue,trRvUnrealizedProfit. El aportado se calculara como valor menos beneficio.</p></div>
        <textarea onChange={(event) => setTradeRepublicEquityAdjustmentsText(event.target.value)} placeholder="month,trRvValue,trRvUnrealizedProfit&#10;2025-07,15526.49,492.93" value={tradeRepublicEquityAdjustmentsText} />
        <div className="migration-actions">
          <button className="primary-button" disabled={!text.trim()} onClick={generatePreview}>Generar previsualización</button>
          <button className="secondary-button" disabled={saving || !tradeRepublicEquityAdjustmentsText.trim()} onClick={applyTradeRepublicEquityAdjustments}>{saving ? 'Aplicando...' : 'Aplicar ajustes TR RV'}</button>
          {error && <span>{error}</span>}
          {adjustmentResult && <span>{adjustmentResult.updated.length} meses actualizados, {adjustmentResult.missing.length} no encontrados, {adjustmentResult.skipped.length} protegidos.</span>}
        </div>
      </section>

      {preview && (
        <>
          <MigrationSummary preview={preview} />
          <section className="panel migration-notes">
            <p className="eyebrow">Criterio de migración</p>
            <p>El total se recalcula únicamente con Caixa, TR CC, TR Inversión, MyInvestor, Criptan y Urbanitae. Intereses, bonos y dividendos se conservan como pagos reales reportados, pero no se suman otra vez al patrimonio. El desglose por activo se muestra como referencia orientativa.</p>
            {mismatches.length > 0 && <strong>{mismatches.length} meses tienen diferencias superiores a 0,05 EUR frente al total antiguo. Revísalos antes de importar.</strong>}
          </section>
          {adjustedRows.length > 0 && (
            <section className="panel migration-table-panel">
              <div className="movements-heading"><div><p className="eyebrow">Ajustes aplicados</p><h2>TR RV beneficio no realizado</h2></div><small>{adjustedRows.length} meses con valor real</small></div>
              <div className="migration-table-wrap">
                <table className="migration-table">
                  <thead><tr><th>Mes</th><th>TR RV valor</th><th>TR RV UP</th><th>TR RV aportado</th></tr></thead>
                  <tbody>{adjustedRows.map((row) => <tr key={row.month}><td>{formatMonth(row.month)}</td><td>{formatMoney(row.tradeRepublicEquityAdjustmentValue ?? 0)}</td><td>{formatMoney(row.tradeRepublicEquityAdjustmentUnrealizedProfit ?? 0)}</td><td>{formatMoney(row.tradeRepublicEquityAdjustmentPrincipal ?? 0)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}
          <section className="panel migration-table-panel">
            <div className="movements-heading"><div><p className="eyebrow">Paso 2</p><h2>Snapshots mensuales propuestos</h2></div><small>Previsualización - todavía no se guarda nada</small></div>
            <div className="migration-table-wrap">
              <table className="migration-table">
                <thead><tr><th>Mes</th><th>Fila usada</th><th>Caixa</th><th>TR CC</th><th>TR inversión</th><th>MyInvestor</th><th>Criptan</th><th>Urbanitae</th><th>Intereses</th><th>Bonos</th><th>Pagos generados</th><th>Oro</th><th>RV</th><th>RV sin oro</th><th>RF</th><th>Cripto</th><th>Inmo</th><th>Total recalculado</th><th>Diferencia</th></tr></thead>
                <tbody>{preview.rows.map((row) => <tr className={Math.abs(row.difference) > 0.05 ? 'mismatch' : ''} key={row.month}><td>{formatMonth(row.month)}</td><td>{formatDate(row.sourceDate)}{row.sourceRowsInMonth > 1 && <em>{row.sourceRowsInMonth} filas</em>}</td><td>{formatMoney(row.caixaBalance)}</td><td>{formatMoney(row.tradeRepublicCashBalance)}</td><td>{formatMoney(row.tradeRepublicInvestmentValue)}</td><td>{formatMoney(row.myInvestorValue)}</td><td>{formatMoney(row.criptanCryptoValue)}</td><td>{formatMoney(row.urbanitaeRealEstateValue)}</td><td>{formatMoney(row.reportedInterest)}</td><td>{formatMoney(row.reportedBondPayments)}</td><td>{formatMoney(row.reportedGeneratedCash)}</td><td>{formatMoney(row.reportedGoldValue)}</td><td>{formatMoney(row.reportedEquityValue)}</td><td>{formatMoney(row.reportedEquityExGoldValue)}</td><td>{formatMoney(row.reportedFixedIncomeValue)}</td><td>{formatMoney(row.reportedCryptoValue)}</td><td>{formatMoney(row.reportedRealEstateValue)}</td><td><strong>{formatMoney(row.recalculatedNetWorth)}</strong></td><td className={Math.abs(row.difference) > 0.05 ? 'amount-warning' : ''}>{formatMoney(row.difference)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="migration-actions">
              <button className="primary-button" disabled={saving || mismatches.length > 0} onClick={importHistoricalRows}>{saving ? 'Guardando...' : 'Guardar históricos visuales'}</button>
              {mismatches.length > 0 && <span>Hay diferencias: revisa la tabla antes de guardar.</span>}
              {importResult && <span>{importResult.imported.length} meses importados, {importResult.updated.length} actualizados, {importResult.skipped.length} protegidos.</span>}
            </div>
          </section>
        </>
      )}
    </>
  )
}
