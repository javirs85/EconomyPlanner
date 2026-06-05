import {
  calculateDashboard,
  classifyTradeRepublicTransactions,
  netAmount,
  normalizeSnapshotOrigin,
  resolveSnapshotPrincipals,
} from '../shared/economyDomain.js'

const investmentTypes = new Set([
  'BENEFITS_SAVEBACK',
  'BUY',
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
])

function byDateRange(transaction, from, to) {
  if (from && transaction.date < from) return false
  if (to && transaction.date > to) return false
  return true
}

function transactionsBetween(data, periodStart, periodEnd) {
  return data.transactions.filter((transaction) => byDateRange(transaction, periodStart, periodEnd))
}

export function latestImportedTransactionDate(data) {
  return data.transactions.reduce((latest, transaction) => {
    if (!transaction.date) return latest
    return !latest || transaction.date > latest ? transaction.date : latest
  }, undefined)
}

export function importTransactions(data, { fileName, coverageStart, coverageEnd, transactions, summary }) {
  const existingIds = new Set(data.transactions.map(({ transactionId }) => transactionId))
  const nextTransactions = [...data.transactions]

  for (const transaction of transactions) {
    if (existingIds.has(transaction.transactionId)) {
      summary.duplicateCount += 1
    } else {
      nextTransactions.push(transaction)
      existingIds.add(transaction.transactionId)
      summary.insertedCount += 1
    }
  }

  const dates = transactions.map(({ date }) => date).sort()
  const batch = {
    id: crypto.randomUUID(),
    source: 'TradeRepublic',
    fileName,
    importedAt: new Date().toISOString(),
    minTransactionDate: dates.at(0),
    maxTransactionDate: dates.at(-1),
    coverageStart,
    coverageEnd,
    summary,
  }

  data.transactions = nextTransactions.sort((left, right) => left.datetime.localeCompare(right.datetime))
  data.importBatches = [...data.importBatches, batch]

  return batch
}

function createExplorerMetrics() {
  return {
    movementCount: 0,
    externalIncome: 0,
    cardExpenses: 0,
    invested: 0,
    investmentSales: 0,
    investmentIncome: 0,
    bondMaturities: 0,
    netCashFlow: 0,
  }
}

function classifyExplorerMetrics(transactions) {
  const metrics = createExplorerMetrics()
  metrics.movementCount = transactions.length

  for (const transaction of transactions) {
    const type = transaction.type ?? ''
    const amount = netAmount(transaction)

    if (type === 'CUSTOMER_INBOUND' || type === 'TRANSFER_INBOUND' || type === 'TRANSFER_INSTANT_INBOUND') metrics.externalIncome += amount
    if (type === 'CARD_TRANSACTION' || type === 'CARD_TRANSACTION_INTERNATIONAL') metrics.cardExpenses += -amount
    if (type === 'BUY') metrics.invested += Math.abs(amount)
    if (type === 'SELL') metrics.investmentSales += Math.abs(amount)
    if (type === 'INTEREST_PAYMENT' || type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT') metrics.investmentIncome += amount
    if (type === 'FINAL_MATURITY' && transaction.category === 'CASH') metrics.bondMaturities += Math.max(0, amount)
    metrics.netCashFlow += amount
  }

  return metrics
}

function matchesFlowFilter(transaction, flow) {
  const type = transaction.type ?? ''
  if (flow === 'externalIncome') return type === 'CUSTOMER_INBOUND' || type === 'TRANSFER_INBOUND' || type === 'TRANSFER_INSTANT_INBOUND'
  if (flow === 'cardExpenses') return type === 'CARD_TRANSACTION' || type === 'CARD_TRANSACTION_INTERNATIONAL'
  if (flow === 'invested') return type === 'BUY'
  if (flow === 'investmentSales') return type === 'SELL'
  if (flow === 'investmentIncome') return type === 'INTEREST_PAYMENT' || type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT'
  if (flow === 'bondMaturities') return type === 'FINAL_MATURITY'
  return true
}

export function exploreTransactions(data, { from, to, investmentsOnly, flow }) {
  const allTransactions = data.transactions
    .filter((transaction) => byDateRange(transaction, from, to))
    .sort((left, right) => right.datetime.localeCompare(left.datetime))
  const baseTransactions = investmentsOnly
    ? allTransactions.filter(({ type }) => investmentTypes.has(type))
    : allTransactions
  const transactions = flow
    ? baseTransactions.filter((transaction) => matchesFlowFilter(transaction, flow))
    : baseTransactions
  const metrics = classifyExplorerMetrics(baseTransactions)
  metrics.movementCount = transactions.length

  return { transactions, metrics }
}

function getCsvCoverage(data, periodStart, periodEnd) {
  const coveredBatches = data.importBatches.filter(({ coverageStart, coverageEnd }) => coverageStart && coverageEnd)
  const coverageStart = coveredBatches.reduce((earliest, batch) => !earliest || batch.coverageStart < earliest ? batch.coverageStart : earliest, undefined)
  const coverageEnd = coveredBatches.reduce((latest, batch) => !latest || batch.coverageEnd > latest ? batch.coverageEnd : latest, undefined)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const requiredCoverageEnd = periodEnd < today ? periodEnd : today

  if (!coverageStart || !coverageEnd || coverageEnd < periodStart || coverageStart > requiredCoverageEnd) {
    return { status: 'missing', coverageStart, coverageEnd }
  }
  if (coverageStart <= periodStart && coverageEnd >= requiredCoverageEnd) {
    return { status: 'complete', coverageStart, coverageEnd }
  }
  return { status: 'partial', coverageStart, coverageEnd }
}

function calculateTradeRepublicFacts(data, periodStart, periodEnd) {
  return classifyTradeRepublicTransactions(transactionsBetween(data, periodStart, periodEnd), periodStart, periodEnd)
}

function getPreviousMonthlySnapshot(data, month) {
  return [...data.monthlySnapshots]
    .filter((snapshot) => snapshot.month < month)
    .sort((left, right) => right.month.localeCompare(left.month))
    .at(0)
}

export function getMonthlyClosing(data, { month, periodStart, periodEnd }) {
  const tradeRepublicFacts = calculateTradeRepublicFacts(data, periodStart, periodEnd)
  return {
    snapshot: data.monthlySnapshots.find((snapshot) => snapshot.month === month),
    previousSnapshot: getPreviousMonthlySnapshot(data, month),
    tradeRepublicExternalFlow: tradeRepublicFacts.tradeRepublicCashContribution,
    tradeRepublicFacts,
    csvCoverage: getCsvCoverage(data, periodStart, periodEnd),
  }
}

export function saveMonthlyClosing(data, snapshot) {
  const now = new Date().toISOString()
  const existing = data.monthlySnapshots.find((candidate) => candidate.month === snapshot.month)
  const tradeRepublicFacts = calculateTradeRepublicFacts(data, snapshot.periodStart, snapshot.periodEnd)
  const historicalSnapshot = snapshot.snapshotOrigin === 'historical-migration' || snapshot.snapshotOrigin === 'historical-visual'
  const generatedCash = historicalSnapshot ? snapshot.generatedCash ?? snapshot.reportedGeneratedCash ?? 0 : tradeRepublicFacts.generatedCash
  const principals = resolveSnapshotPrincipals(snapshot, getPreviousMonthlySnapshot(data, snapshot.month), tradeRepublicFacts)
  const tradeRepublicEquityPrincipal = principals.tradeRepublicEquityPrincipal
  const tradeRepublicCryptoPrincipal = principals.tradeRepublicCryptoPrincipal
  const myInvestorEquityPrincipal = principals.myInvestorEquityPrincipal
  const myInvestorCryptoPrincipal = principals.myInvestorCryptoPrincipal
  const urbanitaeRealEstatePrincipal = principals.urbanitaeRealEstatePrincipal
  const nextSnapshot = {
    ...snapshot,
    schemaVersion: 2,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    criptanExternalFlow: snapshot.criptanExternalFlow ?? 0,
    generatedCash,
    reportedInterest: historicalSnapshot ? snapshot.reportedInterest ?? 0 : 0,
    reportedBondPayments: historicalSnapshot ? snapshot.reportedBondPayments ?? 0 : 0,
    reportedGeneratedCash: historicalSnapshot ? snapshot.reportedGeneratedCash ?? generatedCash : generatedCash,
    tradeRepublicCashContribution: tradeRepublicFacts.tradeRepublicCashContribution,
    tradeRepublicEquityFlow: tradeRepublicFacts.tradeRepublicEquityFlow,
    tradeRepublicFixedIncomeFlow: tradeRepublicFacts.tradeRepublicFixedIncomeFlow,
    tradeRepublicCryptoFlow: tradeRepublicFacts.tradeRepublicCryptoFlow,
    tradeRepublicEquityPrincipal,
    tradeRepublicEquityUnrealizedProfit: snapshot.tradeRepublicEquityValue - tradeRepublicEquityPrincipal,
    tradeRepublicFixedIncomePrincipal: snapshot.tradeRepublicFixedIncomeValue,
    tradeRepublicFixedIncomeUnrealizedProfit: 0,
    tradeRepublicCryptoPrincipal,
    tradeRepublicCryptoUnrealizedProfit: snapshot.tradeRepublicCryptoValue - tradeRepublicCryptoPrincipal,
    myInvestorEquityPrincipal,
    myInvestorEquityUnrealizedProfit: snapshot.myInvestorEquityValue - myInvestorEquityPrincipal,
    myInvestorFixedIncomePrincipal: snapshot.myInvestorFixedIncomeValue,
    myInvestorFixedIncomeUnrealizedProfit: 0,
    myInvestorCryptoPrincipal,
    myInvestorCryptoUnrealizedProfit: snapshot.myInvestorCryptoValue - myInvestorCryptoPrincipal,
    criptanCryptoPrincipal: snapshot.criptanCryptoValue,
    criptanCryptoUnrealizedProfit: 0,
    urbanitaeRealEstatePrincipal,
    urbanitaeRealEstateUnrealizedProfit: snapshot.urbanitaeRealEstateValue - urbanitaeRealEstatePrincipal,
    myInvestorEquityExternalFlow: snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0,
    myInvestorFixedIncomeExternalFlow: snapshot.myInvestorFixedIncomeExternalFlow ?? 0,
    myInvestorCryptoExternalFlow: snapshot.myInvestorCryptoExternalFlow ?? 0,
    myInvestorExternalFlow: (snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0)
      + (snapshot.myInvestorFixedIncomeExternalFlow ?? 0)
      + (snapshot.myInvestorCryptoExternalFlow ?? 0),
    snapshotOrigin: normalizeSnapshotOrigin(snapshot.snapshotOrigin, snapshot.month),
  }

  data.monthlySnapshots = [
    ...data.monthlySnapshots.filter((candidate) => candidate.month !== snapshot.month),
    nextSnapshot,
  ].sort((left, right) => left.month.localeCompare(right.month))

  return getMonthlyClosing(data, nextSnapshot)
}

export function importHistoricalSnapshots(data, snapshots) {
  const existingMonths = new Map(data.monthlySnapshots.map((snapshot) => [snapshot.month, snapshot.snapshotOrigin]))
  const imported = []
  const updated = []
  const skipped = []

  for (const snapshot of snapshots) {
    const existingOrigin = existingMonths.get(snapshot.month)
    if (existingOrigin && existingOrigin !== 'historical-visual' && existingOrigin !== 'historical-migration') {
      skipped.push(snapshot.month)
      continue
    }
    saveMonthlyClosing(data, snapshot)
    if (existingOrigin) {
      updated.push(snapshot.month)
    } else {
      imported.push(snapshot.month)
    }
    existingMonths.set(snapshot.month, snapshot.snapshotOrigin)
  }

  return { imported, updated, skipped }
}

function applyTradeRepublicEquityAdjustment(snapshot, adjustment) {
  const totalTradeRepublicInvestment = (snapshot.tradeRepublicEquityValue ?? 0)
    + (snapshot.tradeRepublicFixedIncomeValue ?? 0)
    + (snapshot.tradeRepublicCryptoValue ?? 0)
  if (adjustment.tradeRepublicEquityValue > totalTradeRepublicInvestment) {
    throw new Error(`El ajuste TR RV de ${snapshot.month} supera el total de TR inversion.`)
  }

  const fixedIncomeAndCrypto = (snapshot.tradeRepublicFixedIncomeValue ?? 0) + (snapshot.tradeRepublicCryptoValue ?? 0)
  const remaining = totalTradeRepublicInvestment - adjustment.tradeRepublicEquityValue
  return {
    ...snapshot,
    tradeRepublicEquityValue: adjustment.tradeRepublicEquityValue,
    tradeRepublicEquityPrincipal: adjustment.tradeRepublicEquityPrincipal,
    tradeRepublicEquityUnrealizedProfit: adjustment.tradeRepublicEquityUnrealizedProfit,
    tradeRepublicFixedIncomeValue: fixedIncomeAndCrypto > 0
      ? remaining * (snapshot.tradeRepublicFixedIncomeValue ?? 0) / fixedIncomeAndCrypto
      : 0,
    tradeRepublicCryptoValue: fixedIncomeAndCrypto > 0
      ? remaining * (snapshot.tradeRepublicCryptoValue ?? 0) / fixedIncomeAndCrypto
      : remaining,
  }
}

export function applyHistoricalTradeRepublicEquityAdjustments(data, adjustments) {
  const updated = []
  const missing = []
  const skipped = []

  for (const [month, adjustment] of adjustments) {
    const snapshot = data.monthlySnapshots.find((candidate) => candidate.month === month)
    if (!snapshot) {
      missing.push(month)
      continue
    }
    if (snapshot.snapshotOrigin !== 'historical-visual' && snapshot.snapshotOrigin !== 'historical-migration') {
      skipped.push(month)
      continue
    }
    saveMonthlyClosing(data, applyTradeRepublicEquityAdjustment(snapshot, adjustment))
    updated.push(month)
  }

  return { updated, missing, skipped }
}

function monthPeriod(year, monthIndex) {
  const month = String(monthIndex + 1).padStart(2, '0')
  const nextMonth = new Date(Date.UTC(year, monthIndex + 1, 3))
  const periodEnd = nextMonth.toISOString().slice(0, 10)
  return {
    month: `${year}-${month}`,
    periodStart: `${year}-${month}-04`,
    periodEnd,
  }
}

export function getYearClosingStatus(data, year) {
  const snapshots = new Set(data.monthlySnapshots
    .filter(({ month }) => month >= `${year}-01` && month <= `${year}-12`)
    .map(({ month }) => month))

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const period = monthPeriod(year, monthIndex)
    return {
      ...period,
      snapshotSaved: snapshots.has(period.month),
      csvCoverage: getCsvCoverage(data, period.periodStart, period.periodEnd),
    }
  })
}

export function getDashboard(data) {
  const snapshots = [...data.monthlySnapshots].sort((left, right) => left.month.localeCompare(right.month))
  return calculateDashboard(snapshots, { transactions: data.transactions })
}
