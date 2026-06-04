import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  getMonthlyClosing,
  saveMonthlyClosing,
  type CsvCoverage,
  type MonthlySnapshot,
} from '../../application/monthlyClosing/monthlyClosing'
import { formatMoney } from '../../shared/money/formatMoney'

const balanceSections = [
  {
    title: 'Caixa',
    fields: [['caixaBalance', 'Cuenta corriente']] as const,
  },
  {
    title: 'Trade Republic',
    fields: [
      ['tradeRepublicCashBalance', 'TR CC'],
      ['tradeRepublicEquityValue', 'TR RV'],
      ['tradeRepublicFixedIncomeValue', 'TR RF'],
      ['tradeRepublicCryptoValue', 'TR Cripto'],
    ] as const,
  },
  {
    title: 'MyInvestor',
    fields: [
      ['myInvestorEquityValue', 'RV'],
      ['myInvestorFixedIncomeValue', 'RF'],
      ['myInvestorCryptoValue', 'Cripto'],
    ] as const,
  },
  {
    title: 'Otros',
    fields: [
      ['criptanCryptoValue', 'Criptan'],
      ['urbanitaeRealEstateValue', 'Urbanitae'],
    ] as const,
  },
] as const

const balanceFields = balanceSections.flatMap((section) => section.fields.map(([field]) => field))

type BalanceField = typeof balanceFields[number]
type FlowField = 'myInvestorEquityExternalFlow' | 'myInvestorFixedIncomeExternalFlow' | 'myInvestorCryptoExternalFlow' | 'criptanExternalFlow' | 'urbanitaeExternalFlow'
type FormValues = Record<BalanceField | FlowField, string>

const emptyValues: FormValues = {
  caixaBalance: '',
  tradeRepublicCashBalance: '',
  tradeRepublicEquityValue: '',
  tradeRepublicFixedIncomeValue: '0',
  tradeRepublicCryptoValue: '',
  myInvestorEquityValue: '',
  myInvestorFixedIncomeValue: '0',
  myInvestorCryptoValue: '',
  criptanCryptoValue: '',
  urbanitaeRealEstateValue: '',
  myInvestorEquityExternalFlow: '0',
  myInvestorFixedIncomeExternalFlow: '0',
  myInvestorCryptoExternalFlow: '0',
  criptanExternalFlow: '0',
  urbanitaeExternalFlow: '0',
}

function periodForMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const periodEnd = new Date(Date.UTC(year, monthNumber, 3)).toISOString().slice(0, 10)
  return { month, periodStart: `${month}-04`, periodEnd }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-ES').format(new Date(`${date}T00:00:00`))
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
}

function formatInputNumber(value: number) {
  return String(Math.round((value + Number.EPSILON) * 100) / 100).replace('.', ',')
}

function snapshotToValues(snapshot: MonthlySnapshot): FormValues {
  return {
    ...Object.fromEntries(
      balanceFields.map((key) => [key, formatInputNumber(Number(snapshot[key]))]),
    ),
    myInvestorEquityExternalFlow: formatInputNumber(snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0),
    myInvestorFixedIncomeExternalFlow: formatInputNumber(snapshot.myInvestorFixedIncomeExternalFlow ?? 0),
    myInvestorCryptoExternalFlow: formatInputNumber(snapshot.myInvestorCryptoExternalFlow ?? 0),
    criptanExternalFlow: formatInputNumber(snapshot.criptanExternalFlow ?? 0),
    urbanitaeExternalFlow: formatInputNumber(snapshot.urbanitaeExternalFlow ?? 0),
  } as FormValues
}

function resolveSumExpression(value: string) {
  const normalized = value.replace(',', '.').trim()
  if (!normalized.includes('+')) {
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? formatInputNumber(parsed) : value
  }

  const terms = normalized.split('+').map((term) => term.trim())
  if (terms.some((term) => !/^-?\d+(?:\.\d+)?$/.test(term))) return value

  return formatInputNumber(terms.reduce((sum, term) => sum + Number(term), 0))
}

function numericValue(value: string) {
  const resolved = resolveSumExpression(value)
  const parsed = Number(resolved.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function coverageCopy(coverage: CsvCoverage, periodEnd: string) {
  if (coverage.status === 'complete') return { tone: 'complete', symbol: 'OK', text: 'CSV Trade Republic cubierto para todo el periodo.' }
  if (coverage.status === 'partial') return { tone: 'partial', symbol: '~', text: `CSV cubierto parcialmente hasta ${formatDate(coverage.coverageEnd ?? periodEnd)}.` }
  return { tone: 'missing', symbol: '-', text: 'CSV Trade Republic pendiente para este periodo.' }
}

export function MonthlyClosingPanel({
  month,
  refreshKey,
  onSaved,
  tradeRepublicImport,
}: {
  month: string
  refreshKey: number
  onSaved: () => void
  tradeRepublicImport?: ReactNode
}) {
  const period = useMemo(() => periodForMonth(month), [month])
  const [values, setValues] = useState(emptyValues)
  const [tradeRepublicExternalFlow, setTradeRepublicExternalFlow] = useState(0)
  const [coverage, setCoverage] = useState<CsvCoverage>({ status: 'missing' })
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let ignore = false
    void getMonthlyClosing(period.month, period.periodStart, period.periodEnd)
      .then((status) => {
        if (ignore) return
        setTradeRepublicExternalFlow(status.tradeRepublicExternalFlow)
        setCoverage(status.csvCoverage)
        setSaved(Boolean(status.snapshot))
        setExpanded(!status.snapshot)
        setValues(status.snapshot ? snapshotToValues(status.snapshot) : emptyValues)
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(caught instanceof Error ? caught.message : 'No se pudo consultar el cierre.')
      })

    return () => { ignore = true }
  }, [period.month, period.periodEnd, period.periodStart, refreshKey])

  const total = balanceFields.reduce((sum, field) => sum + numericValue(values[field]), 0)
  const coverageStatus = coverageCopy(coverage, period.periodEnd)
  const cashPlan = useMemo(() => {
    const target = 10_000
    const caixa = numericValue(values.caixaBalance)
    const tradeRepublicCash = numericValue(values.tradeRepublicCashBalance)
    const requestedTopUp = Math.max(0, target - tradeRepublicCash)
    const caixaToTradeRepublic = Math.min(requestedTopUp, caixa)
    const tradeRepublicToCaixa = Math.max(0, tradeRepublicCash - target)
    const caixaAfterBalancing = caixa - caixaToTradeRepublic + tradeRepublicToCaixa
    const tradeRepublicAfterBalancing = tradeRepublicCash + caixaToTradeRepublic - tradeRepublicToCaixa
    const availableToSave = Math.max(0, caixaAfterBalancing - target)

    return {
      target,
      caixaAfterBalancing,
      tradeRepublicAfterBalancing,
      caixaToTradeRepublic,
      tradeRepublicToCaixa,
      availableToSave,
      insufficientCaixa: requestedTopUp > caixaToTradeRepublic,
    }
  }, [values.caixaBalance, values.tradeRepublicCashBalance])

  function setValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function resolveValue(field: keyof FormValues) {
    setValues((current) => ({ ...current, [field]: resolveSumExpression(current[field]) }))
  }

  function inputFor(field: keyof FormValues) {
    return {
      inputMode: 'decimal' as const,
      onBlur: () => resolveValue(field),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(field, event.target.value),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') resolveValue(field) },
      placeholder: '0',
      required: true,
      type: 'text',
      value: values[field],
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      const amounts = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numericValue(value)]))
      const status = await saveMonthlyClosing({ ...amounts, ...period } as MonthlySnapshot)
      setTradeRepublicExternalFlow(status.tradeRepublicExternalFlow)
      setCoverage(status.csvCoverage)
      setSaved(true)
      setExpanded(false)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el cierre.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`panel monthly-closing ${expanded ? '' : 'collapsed'}`}>
      <div className="closing-heading">
        <div>
          <p className="eyebrow">Cierre mensual · {formatMonth(period.month)}</p>
          <h2>{saved ? 'Datos del mes guardados' : 'Completa los saldos del mes'}</h2>
          <p>{formatDate(period.periodStart)} {'->'} {formatDate(period.periodEnd)} · El dashboard se actualizara al guardar este cierre.</p>
        </div>
        <div className="closing-heading-actions">
          {saved && <span className="success-pill">Cierre guardado</span>}
          {saved && <button className="secondary-button" onClick={() => setExpanded((current) => !current)}>{expanded ? 'Ocultar' : 'Editar datos'}</button>}
        </div>
      </div>

      <div className="closing-checklist">
        <div className={coverageStatus.tone}><b>{coverageStatus.symbol}</b><span>{coverageStatus.text}</span></div>
        <div className={saved ? 'complete' : 'missing'}><b>{saved ? 'OK' : '-'}</b><span>{saved ? 'Saldos manuales guardados.' : 'Saldos manuales pendientes.'}</span></div>
      </div>

      {expanded && (
        <form onSubmit={submit}>
          <div className="closing-form-stack">
            {balanceSections.map((section) => (
              <fieldset className={`closing-section closing-section-${section.title.toLowerCase().replaceAll(' ', '-')}`} key={section.title}>
                <legend>{section.title}</legend>
                <div className="closing-form-grid">
                  {section.fields.map(([field, label]) => (
                    <label className="balance-input" key={field}>
                      <span>{label}</span><small>Saldo de cierre</small>
                      <div><input min="0" {...inputFor(field)} /><b>EUR</b></div>
                    </label>
                  ))}
                </div>
                {section.title === 'Trade Republic' && tradeRepublicImport}
              </fieldset>
            ))}
          </div>

          <div className="cash-plan">
            <div className="cash-plan-heading">
              <div><span>Plan de caja</span><small>Objetivo operativo: {formatMoney(cashPlan.target)} en Caixa y TR CC</small></div>
            </div>
            <div className="cash-plan-grid">
              {cashPlan.caixaToTradeRepublic > 0 && <p><b>Caixa {'->'} TR CC</b><strong>{formatMoney(cashPlan.caixaToTradeRepublic)}</strong></p>}
              {cashPlan.tradeRepublicToCaixa > 0 && <p><b>TR CC {'->'} Caixa</b><strong>{formatMoney(cashPlan.tradeRepublicToCaixa)}</strong></p>}
              {cashPlan.caixaToTradeRepublic === 0 && cashPlan.tradeRepublicToCaixa === 0 && <p><b>TR CC</b><strong>Ya esta en objetivo</strong></p>}
              <p><b>Caixa tras ajustar TR CC</b><strong>{formatMoney(cashPlan.caixaAfterBalancing)}</strong></p>
              <p><b>Disponible para ahorrar</b><strong>{formatMoney(cashPlan.availableToSave)}</strong></p>
            </div>
            {cashPlan.insufficientCaixa && <small className="cash-plan-warning">Caixa no tiene saldo suficiente para llevar TR CC hasta {formatMoney(cashPlan.target)}.</small>}
          </div>

          <div className="closing-flow-row">
            <label className="balance-input">
              <span>MyInv RV flow</span><small>Flujo externo manual del periodo</small>
              <div><input {...inputFor('myInvestorEquityExternalFlow')} /><b>EUR</b></div>
            </label>
            <label className="balance-input">
              <span>MyInv RF flow</span><small>Flujo externo manual del periodo</small>
              <div><input {...inputFor('myInvestorFixedIncomeExternalFlow')} /><b>EUR</b></div>
            </label>
            <label className="balance-input">
              <span>MyInv Cripto flow</span><small>Flujo externo manual del periodo</small>
              <div><input {...inputFor('myInvestorCryptoExternalFlow')} /><b>EUR</b></div>
            </label>
            <label className="balance-input">
              <span>Urbanitae flow</span><small>Flujo externo manual del periodo</small>
              <div><input {...inputFor('urbanitaeExternalFlow')} /><b>EUR</b></div>
            </label>
            <label className="balance-input">
              <span>Criptan flow</span><small>Flujo externo manual del periodo</small>
              <div><input {...inputFor('criptanExternalFlow')} /><b>EUR</b></div>
            </label>
            <div className="detected-flow"><span>TR flow</span><small>No editable, detectado en CSV</small><strong>{tradeRepublicExternalFlow >= 0 ? '+' : ''}{formatMoney(tradeRepublicExternalFlow)}</strong></div>
            <div className="closing-total"><span>Patrimonio introducido</span><strong>{formatMoney(total)}</strong></div>
            <button className="primary-button" disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
          {error && <p className="import-error">{error}</p>}
        </form>
      )}
    </section>
  )
}
