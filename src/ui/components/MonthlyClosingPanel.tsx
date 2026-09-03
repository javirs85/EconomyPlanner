import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  getMonthlyClosing,
  saveMonthlyClosing,
  type CsvCoverage,
  type IgnoredTradeRepublicOutbound,
  type MonthlySnapshot,
  type TradeRepublicFacts,
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
      ['tradeRepublicEquityValue', 'TR RV valor'],
      ['tradeRepublicEquityProfit', 'TR RV beneficio'],
      ['tradeRepublicFixedIncomeValue', 'TR RF vivo'],
      ['tradeRepublicFixedIncomeProfit', 'TR RF beneficio'],
      ['tradeRepublicCryptoValue', 'TR Cripto valor'],
      ['tradeRepublicCryptoProfit', 'TR Cripto beneficio'],
    ] as const,
  },
  {
    title: 'MyInvestor',
    fields: [
      ['myInvestorEquityValue', 'RV valor'],
      ['myInvestorEquityProfit', 'RV beneficio'],
      ['myInvestorFixedIncomeValue', 'RF vivo'],
      ['myInvestorFixedIncomeProfit', 'RF beneficio'],
      ['myInvestorCryptoValue', 'Cripto valor'],
      ['myInvestorCryptoProfit', 'Cripto beneficio'],
    ] as const,
  },
  {
    title: 'Otros',
    fields: [
      ['criptanCryptoValue', 'Criptan'],
      ['urbanitaeRealEstateValue', 'Urbanitae valor'],
      ['urbanitaeRealEstateProfit', 'Urbanitae beneficio'],
    ] as const,
  },
] as const

const balanceFields = balanceSections.flatMap((section) => section.fields.map(([field]) => field))
const profitFields = new Set<string>([
  'tradeRepublicEquityProfit',
  'tradeRepublicFixedIncomeProfit',
  'tradeRepublicCryptoProfit',
  'myInvestorEquityProfit',
  'myInvestorFixedIncomeProfit',
  'myInvestorCryptoProfit',
  'urbanitaeRealEstateProfit',
])
const netWorthFields = balanceFields.filter((field) => !profitFields.has(field))

type BalanceField = typeof balanceFields[number]
type PrincipalField = 'tradeRepublicEquityPrincipal' | 'tradeRepublicFixedIncomePrincipal' | 'tradeRepublicCryptoPrincipal' | 'myInvestorEquityPrincipal' | 'myInvestorFixedIncomePrincipal' | 'myInvestorCryptoPrincipal' | 'urbanitaeRealEstatePrincipal'
type FlowField = 'myInvestorEquityExternalFlow' | 'myInvestorFixedIncomeExternalFlow' | 'myInvestorCryptoExternalFlow' | 'criptanExternalFlow' | 'urbanitaeExternalFlow'
type FormValues = Record<BalanceField | PrincipalField | FlowField, string>

const emptyValues: FormValues = {
  caixaBalance: '',
  tradeRepublicCashBalance: '',
  tradeRepublicEquityValue: '',
  tradeRepublicEquityProfit: '',
  tradeRepublicEquityPrincipal: '',
  tradeRepublicFixedIncomeValue: '0',
  tradeRepublicFixedIncomeProfit: '',
  tradeRepublicFixedIncomePrincipal: '',
  tradeRepublicCryptoValue: '',
  tradeRepublicCryptoProfit: '',
  tradeRepublicCryptoPrincipal: '',
  myInvestorEquityValue: '',
  myInvestorEquityProfit: '',
  myInvestorEquityPrincipal: '',
  myInvestorFixedIncomeValue: '0',
  myInvestorFixedIncomeProfit: '',
  myInvestorFixedIncomePrincipal: '',
  myInvestorCryptoValue: '',
  myInvestorCryptoProfit: '',
  myInvestorCryptoPrincipal: '',
  criptanCryptoValue: '',
  urbanitaeRealEstateValue: '',
  urbanitaeRealEstateProfit: '',
  urbanitaeRealEstatePrincipal: '',
  myInvestorEquityExternalFlow: '0',
  myInvestorFixedIncomeExternalFlow: '0',
  myInvestorCryptoExternalFlow: '0',
  criptanExternalFlow: '0',
  urbanitaeExternalFlow: '0',
}

const emptyTradeRepublicFacts: TradeRepublicFacts = {
  tradeRepublicCashContribution: 0,
  tradeRepublicEquityFlow: 0,
  tradeRepublicFixedIncomeFlow: 0,
  tradeRepublicCryptoFlow: 0,
  generatedCash: 0,
  cardExpenses: 0,
  ignoredOutbounds: [],
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

function snapshotProfit(snapshot: MonthlySnapshot, valueField: keyof MonthlySnapshot, principalField: keyof MonthlySnapshot) {
  return Number(snapshot[valueField] ?? 0) - Number(snapshot[principalField] ?? snapshot[valueField] ?? 0)
}

function snapshotFieldValue(snapshot: MonthlySnapshot, field: BalanceField) {
  if (field === 'tradeRepublicEquityProfit') return snapshotProfit(snapshot, 'tradeRepublicEquityValue', 'tradeRepublicEquityPrincipal')
  if (field === 'tradeRepublicFixedIncomeProfit') return snapshotProfit(snapshot, 'tradeRepublicFixedIncomeValue', 'tradeRepublicFixedIncomePrincipal')
  if (field === 'tradeRepublicCryptoProfit') return snapshotProfit(snapshot, 'tradeRepublicCryptoValue', 'tradeRepublicCryptoPrincipal')
  if (field === 'myInvestorEquityProfit') return snapshotProfit(snapshot, 'myInvestorEquityValue', 'myInvestorEquityPrincipal')
  if (field === 'myInvestorFixedIncomeProfit') return snapshotProfit(snapshot, 'myInvestorFixedIncomeValue', 'myInvestorFixedIncomePrincipal')
  if (field === 'myInvestorCryptoProfit') return snapshotProfit(snapshot, 'myInvestorCryptoValue', 'myInvestorCryptoPrincipal')
  if (field === 'urbanitaeRealEstateProfit') return snapshotProfit(snapshot, 'urbanitaeRealEstateValue', 'urbanitaeRealEstatePrincipal')
  return Number(snapshot[field] ?? 0)
}

function snapshotToValues(snapshot: MonthlySnapshot): FormValues {
  return {
    ...Object.fromEntries(
      balanceFields.map((key) => [key, formatInputNumber(snapshotFieldValue(snapshot, key))]),
    ),
    tradeRepublicEquityPrincipal: formatInputNumber(snapshot.tradeRepublicEquityPrincipal ?? snapshot.tradeRepublicEquityValue ?? 0),
    tradeRepublicFixedIncomePrincipal: formatInputNumber(snapshot.tradeRepublicFixedIncomePrincipal ?? snapshot.tradeRepublicFixedIncomeValue ?? 0),
    tradeRepublicCryptoPrincipal: formatInputNumber(snapshot.tradeRepublicCryptoPrincipal ?? snapshot.tradeRepublicCryptoValue ?? 0),
    myInvestorEquityPrincipal: formatInputNumber(snapshot.myInvestorEquityPrincipal ?? snapshot.myInvestorEquityValue ?? 0),
    myInvestorFixedIncomePrincipal: formatInputNumber(snapshot.myInvestorFixedIncomePrincipal ?? snapshot.myInvestorFixedIncomeValue ?? 0),
    myInvestorCryptoPrincipal: formatInputNumber(snapshot.myInvestorCryptoPrincipal ?? snapshot.myInvestorCryptoValue ?? 0),
    urbanitaeRealEstatePrincipal: formatInputNumber(snapshot.urbanitaeRealEstatePrincipal ?? snapshot.urbanitaeRealEstateValue ?? 0),
    myInvestorEquityExternalFlow: formatInputNumber(snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0),
    myInvestorFixedIncomeExternalFlow: formatInputNumber(snapshot.myInvestorFixedIncomeExternalFlow ?? 0),
    myInvestorCryptoExternalFlow: formatInputNumber(snapshot.myInvestorCryptoExternalFlow ?? 0),
    criptanExternalFlow: formatInputNumber(snapshot.criptanExternalFlow ?? 0),
    urbanitaeExternalFlow: formatInputNumber(snapshot.urbanitaeExternalFlow ?? 0),
  } as FormValues
}

function resolveArithmeticExpression(value: string) {
  const normalized = value.replace(',', '.').trim()
  if (!/[+\-*/()]/.test(normalized.slice(1))) {
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? formatInputNumber(parsed) : value
  }

  const parsed = parseExpression(normalized)
  return parsed === undefined ? value : formatInputNumber(parsed)
}

function parseExpression(expression: string) {
  let index = 0

  function skipSpaces() {
    while (expression[index] === ' ') index += 1
  }

  function parseNumber(): number | undefined {
    skipSpaces()
    const start = index
    while (/\d|\./.test(expression[index] ?? '')) index += 1
    if (start === index) return undefined
    const value = Number(expression.slice(start, index))
    return Number.isFinite(value) ? value : undefined
  }

  function parseFactor(): number | undefined {
    skipSpaces()
    if (expression[index] === '+') {
      index += 1
      return parseFactor()
    }
    if (expression[index] === '-') {
      index += 1
      const value: number | undefined = parseFactor()
      return value === undefined ? undefined : -value
    }
    if (expression[index] === '(') {
      index += 1
      const value: number | undefined = parseAddSubtract()
      skipSpaces()
      if (expression[index] !== ')') return undefined
      index += 1
      return value
    }
    return parseNumber()
  }

  function parseMultiplyDivide(): number | undefined {
    let value: number | undefined = parseFactor()
    if (value === undefined) return undefined

    while (true) {
      skipSpaces()
      const operator = expression[index]
      if (operator !== '*' && operator !== '/') return value
      index += 1
      const right = parseFactor()
      if (right === undefined) return undefined
      if (operator === '/' && right === 0) return undefined
      value = operator === '*' ? value * right : value / right
    }
  }

  function parseAddSubtract(): number | undefined {
    let value: number | undefined = parseMultiplyDivide()
    if (value === undefined) return undefined

    while (true) {
      skipSpaces()
      const operator = expression[index]
      if (operator !== '+' && operator !== '-') return value
      index += 1
      const right = parseMultiplyDivide()
      if (right === undefined) return undefined
      value = operator === '+' ? value + right : value - right
    }
  }

  const value = parseAddSubtract()
  skipSpaces()
  return value !== undefined && index === expression.length ? value : undefined
}

function numericValue(value: string) {
  const resolved = resolveArithmeticExpression(value)
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
  const [tradeRepublicFacts, setTradeRepublicFacts] = useState<TradeRepublicFacts>(emptyTradeRepublicFacts)
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
        setTradeRepublicFacts(status.tradeRepublicFacts ?? { ...emptyTradeRepublicFacts, tradeRepublicCashContribution: status.tradeRepublicExternalFlow })
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

  const total = netWorthFields.reduce((sum, field) => sum + numericValue(values[field]), 0)
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
    setValues((current) => ({ ...current, [field]: resolveArithmeticExpression(current[field]) }))
  }

  function inputFor(field: keyof FormValues) {
    return {
      inputMode: 'decimal' as const,
      onBlur: () => resolveValue(field),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(field, event.target.value),
      onFocus: (event: React.FocusEvent<HTMLInputElement>) => event.target.select(),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') resolveValue(field) },
      placeholder: '0',
      required: true,
      type: 'text',
      value: values[field],
    }
  }

  function principalFor(field: keyof FormValues) {
    if (field === 'tradeRepublicEquityPrincipal') return Math.max(0, numericValue(values.tradeRepublicEquityValue) - numericValue(values.tradeRepublicEquityProfit))
    if (field === 'tradeRepublicFixedIncomePrincipal') return Math.max(0, numericValue(values.tradeRepublicFixedIncomeValue) - numericValue(values.tradeRepublicFixedIncomeProfit))
    if (field === 'tradeRepublicCryptoPrincipal') return Math.max(0, numericValue(values.tradeRepublicCryptoValue) - numericValue(values.tradeRepublicCryptoProfit))
    if (field === 'myInvestorEquityPrincipal') return Math.max(0, numericValue(values.myInvestorEquityValue) - numericValue(values.myInvestorEquityProfit))
    if (field === 'myInvestorFixedIncomePrincipal') return Math.max(0, numericValue(values.myInvestorFixedIncomeValue) - numericValue(values.myInvestorFixedIncomeProfit))
    if (field === 'myInvestorCryptoPrincipal') return Math.max(0, numericValue(values.myInvestorCryptoValue) - numericValue(values.myInvestorCryptoProfit))
    if (field === 'urbanitaeRealEstatePrincipal') return Math.max(0, numericValue(values.urbanitaeRealEstateValue) - numericValue(values.urbanitaeRealEstateProfit))
    return numericValue(values[field])
  }

  function currentPrincipalValues() {
    return {
      tradeRepublicEquityPrincipal: principalFor('tradeRepublicEquityPrincipal'),
      tradeRepublicFixedIncomePrincipal: principalFor('tradeRepublicFixedIncomePrincipal'),
      tradeRepublicCryptoPrincipal: principalFor('tradeRepublicCryptoPrincipal'),
      myInvestorEquityPrincipal: principalFor('myInvestorEquityPrincipal'),
      myInvestorFixedIncomePrincipal: principalFor('myInvestorFixedIncomePrincipal'),
      myInvestorCryptoPrincipal: principalFor('myInvestorCryptoPrincipal'),
      urbanitaeRealEstatePrincipal: principalFor('urbanitaeRealEstatePrincipal'),
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      const amounts = {
        ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numericValue(value)])),
        ...currentPrincipalValues(),
      }
      const status = await saveMonthlyClosing({ ...amounts, ...period } as MonthlySnapshot)
      setTradeRepublicFacts(status.tradeRepublicFacts ?? { ...emptyTradeRepublicFacts, tradeRepublicCashContribution: status.tradeRepublicExternalFlow })
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
                      <span>{label}</span><small>{profitFields.has(field) ? 'Beneficio mostrado por la plataforma' : 'Saldo de cierre'}</small>
                      <div><input {...inputFor(field)} /><b>EUR</b></div>
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
            <DetectedFlow label="TR aportado" value={tradeRepublicFacts.tradeRepublicCashContribution} />
            <DetectedFlow label="TR RV flow" value={tradeRepublicFacts.tradeRepublicEquityFlow} />
            <DetectedFlow label="TR RF flow" value={tradeRepublicFacts.tradeRepublicFixedIncomeFlow} />
            <DetectedFlow label="TR Cripto flow" value={tradeRepublicFacts.tradeRepublicCryptoFlow} />
            <DetectedFlow label="Generated cash" value={tradeRepublicFacts.generatedCash} />
            <div className="closing-total"><span>Patrimonio introducido</span><strong>{formatMoney(total)}</strong></div>
            <button className="primary-button" disabled={saving} type="submit">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
          {tradeRepublicFacts.ignoredOutbounds.length > 0 && <IgnoredOutboundsWarning outbounds={tradeRepublicFacts.ignoredOutbounds} />}
          {error && <p className="import-error">{error}</p>}
        </form>
      )}
    </section>
  )
}

function DetectedFlow({ label, value }: { label: string, value: number }) {
  return (
    <div className="detected-flow">
      <span>{label}</span>
      <small>No editable, detectado en CSV</small>
      <strong>{value >= 0 ? '+' : ''}{formatMoney(value)}</strong>
    </div>
  )
}

function IgnoredOutboundsWarning({ outbounds }: { outbounds: IgnoredTradeRepublicOutbound[] }) {
  return (
    <div className="outbound-warning">
      <span>Outbounds ignorados</span>
      <p>No los he considerado flow. Si alguno mueve dinero hacia otra plataforma, integralo en el flow manual correspondiente.</p>
      <div>
        {outbounds.map((outbound, index) => (
          <article key={`${outbound.date}-${outbound.amount}-${index}`}>
            <b>{formatDate(outbound.date)}</b>
            <strong>{formatMoney(outbound.amount)}</strong>
            <small>{outbound.description || outbound.counterpartyName || outbound.paymentReference || 'Transferencia saliente'}</small>
          </article>
        ))}
      </div>
    </div>
  )
}
