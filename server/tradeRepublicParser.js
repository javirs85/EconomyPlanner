import Papa from 'papaparse'
import { classifyTradeRepublicTransactions, netAmount } from '../shared/economyDomain.js'

const recognizedTypes = new Set([
  'BENEFITS_SAVEBACK',
  'BUY',
  'CARD_TRANSACTION',
  'CARD_TRANSACTION_INTERNATIONAL',
  'CUSTOMER_INBOUND',
  'CUSTOMER_OUTBOUND',
  'DIVIDEND',
  'DIVIDEND_PAYMENT',
  'FEE',
  'FINAL_MATURITY',
  'INTEREST_PAYMENT',
  'MIGRATION',
  'SELL',
  'STOCKPERK',
  'TAX',
  'TAX_OPTIMIZATION',
  'TRANSFER_INBOUND',
  'TRANSFER_INSTANT_INBOUND',
  'TRANSFER_INSTANT_OUTBOUND',
  'TRANSFER_OUTBOUND',
])

function optionalText(value) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function optionalNumber(value) {
  const normalized = optionalText(value)
  if (!normalized) return undefined

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function createEmptySummary() {
  return {
    rowCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    unknownCount: 0,
    interest: 0,
    dividends: 0,
    bondMaturities: 0,
    benefits: 0,
    buys: 0,
    sells: 0,
    externalContributions: 0,
    externalWithdrawals: 0,
    cardExpenses: 0,
    taxes: 0,
  }
}

function summarize(transactions) {
  const summary = createEmptySummary()
  summary.rowCount = transactions.length
  const facts = classifyTradeRepublicTransactions(transactions)

  for (const transaction of transactions) {
    const type = transaction.type ?? ''
    const amount = netAmount(transaction)

    if (!recognizedTypes.has(type)) summary.unknownCount += 1
    if (type === 'INTEREST_PAYMENT') summary.interest += amount
    if (type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT') summary.dividends += amount
    if (type === 'FINAL_MATURITY' && transaction.category === 'CASH') summary.bondMaturities += Math.max(0, amount)
    if (type === 'BENEFITS_SAVEBACK' || type === 'STOCKPERK') summary.benefits += amount
    if (type === 'BUY') summary.buys += Math.abs(amount)
    if (type === 'SELL') summary.sells += Math.abs(amount)
    if (type === 'CUSTOMER_INBOUND' || type === 'TRANSFER_INBOUND' || type === 'TRANSFER_INSTANT_INBOUND') summary.externalContributions += Math.abs(amount)
    if (type === 'CUSTOMER_OUTBOUND' || type === 'TRANSFER_OUTBOUND' || type === 'TRANSFER_INSTANT_OUTBOUND') summary.externalWithdrawals += Math.abs(amount)
    if (type === 'TAX' || type === 'TAX_OPTIMIZATION') summary.taxes += Math.abs(transaction.tax ?? amount)
  }

  summary.cardExpenses = facts.cardExpenses
  return summary
}

export function parseTradeRepublicCsv(csv) {
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: 'greedy' })
  if (parsed.errors.length > 0) throw new Error(`No se pudo leer el CSV: ${parsed.errors[0].message}`)

  const transactions = parsed.data.map((raw, index) => {
    const transactionId = optionalText(raw.transaction_id)
    const datetime = optionalText(raw.datetime)
    const date = optionalText(raw.date)
    if (!transactionId || !datetime || !date) throw new Error(`La fila ${index + 2} no tiene transaction_id, datetime o date.`)

    return {
      transactionId,
      datetime,
      date,
      accountType: optionalText(raw.account_type),
      category: optionalText(raw.category),
      type: optionalText(raw.type),
      assetClass: optionalText(raw.asset_class),
      name: optionalText(raw.name),
      symbol: optionalText(raw.symbol),
      shares: optionalNumber(raw.shares),
      price: optionalNumber(raw.price),
      amount: optionalNumber(raw.amount),
      fee: optionalNumber(raw.fee),
      tax: optionalNumber(raw.tax),
      currency: optionalText(raw.currency),
      originalAmount: optionalNumber(raw.original_amount),
      originalCurrency: optionalText(raw.original_currency),
      fxRate: optionalNumber(raw.fx_rate),
      description: optionalText(raw.description),
      counterpartyName: optionalText(raw.counterparty_name),
      counterpartyIban: optionalText(raw.counterparty_iban),
      paymentReference: optionalText(raw.payment_reference),
      mccCode: optionalText(raw.mcc_code),
      raw,
    }
  })

  return { transactions, summary: summarize(transactions) }
}
