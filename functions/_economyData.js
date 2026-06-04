const baselineMonth = '2026-05'

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

function sumTransactions(data, periodStart, periodEnd, reducer) {
  return transactionsBetween(data, periodStart, periodEnd).reduce((sum, transaction) => sum + reducer(transaction), 0)
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
    const amount = transaction.amount ?? 0

    if (type === 'CUSTOMER_INBOUND' || type === 'TRANSFER_INBOUND' || type === 'TRANSFER_INSTANT_INBOUND') metrics.externalIncome += Math.abs(amount)
    if (type === 'CARD_TRANSACTION' || type === 'CARD_TRANSACTION_INTERNATIONAL') metrics.cardExpenses += Math.abs(amount)
    if (type === 'BUY') metrics.invested += Math.abs(amount)
    if (type === 'SELL') metrics.investmentSales += Math.abs(amount)
    if (type === 'INTEREST_PAYMENT' || type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT' || type === 'BENEFITS_SAVEBACK' || type === 'STOCKPERK') metrics.investmentIncome += Math.max(0, amount)
    if (type === 'FINAL_MATURITY') metrics.bondMaturities += Math.max(0, amount)
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
  if (flow === 'investmentIncome') return type === 'INTEREST_PAYMENT' || type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT' || type === 'BENEFITS_SAVEBACK' || type === 'STOCKPERK'
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

function calculateTradeRepublicExternalFlow(data, periodStart, periodEnd) {
  return sumTransactions(data, periodStart, periodEnd, (transaction) => {
    const type = transaction.type ?? ''
    const amount = transaction.amount ?? 0
    if (type === 'CUSTOMER_INBOUND' || type === 'TRANSFER_INBOUND' || type === 'TRANSFER_INSTANT_INBOUND') return amount
    if (type === 'CUSTOMER_OUTBOUND' || type === 'TRANSFER_OUTBOUND' || type === 'TRANSFER_INSTANT_OUTBOUND') return -Math.abs(amount)
    return 0
  })
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

function snapshotOriginForMonth(month) {
  if (month < baselineMonth) return 'historical-visual'
  if (month === baselineMonth) return 'baseline'
  return 'tracked'
}

function normalizeSnapshotOrigin(origin, month) {
  if (origin === 'historical-visual' || origin === 'baseline' || origin === 'tracked') return origin
  return snapshotOriginForMonth(month)
}

export function getMonthlyClosing(data, { month, periodStart, periodEnd }) {
  return {
    snapshot: data.monthlySnapshots.find((snapshot) => snapshot.month === month),
    tradeRepublicExternalFlow: calculateTradeRepublicExternalFlow(data, periodStart, periodEnd),
    csvCoverage: getCsvCoverage(data, periodStart, periodEnd),
  }
}

export function saveMonthlyClosing(data, snapshot) {
  const now = new Date().toISOString()
  const existing = data.monthlySnapshots.find((candidate) => candidate.month === snapshot.month)
  const nextSnapshot = {
    ...snapshot,
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    criptanExternalFlow: snapshot.criptanExternalFlow ?? 0,
    reportedInterest: snapshot.reportedInterest ?? 0,
    reportedBondPayments: snapshot.reportedBondPayments ?? 0,
    reportedGeneratedCash: snapshot.reportedGeneratedCash ?? 0,
    snapshotOrigin: normalizeSnapshotOrigin(snapshot.snapshotOrigin, snapshot.month),
  }

  data.monthlySnapshots = [
    ...data.monthlySnapshots.filter((candidate) => candidate.month !== snapshot.month),
    nextSnapshot,
  ].sort((left, right) => left.month.localeCompare(right.month))

  return getMonthlyClosing(data, nextSnapshot)
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

function snapshotNetWorth(snapshot) {
  return snapshot.caixaBalance
    + snapshot.tradeRepublicCashBalance
    + snapshot.tradeRepublicEquityValue
    + snapshot.tradeRepublicFixedIncomeValue
    + snapshot.tradeRepublicCryptoValue
    + snapshot.myInvestorEquityValue
    + snapshot.myInvestorFixedIncomeValue
    + snapshot.myInvestorCryptoValue
    + snapshot.criptanCryptoValue
    + snapshot.urbanitaeRealEstateValue
}

function calculateDetectedYields(data, periodStart, periodEnd) {
  return sumTransactions(data, periodStart, periodEnd, (transaction) => {
    const type = transaction.type ?? ''
    if (type === 'INTEREST_PAYMENT' || type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT' || type === 'BENEFITS_SAVEBACK' || type === 'STOCKPERK') return transaction.amount ?? 0
    return 0
  })
}

function calculateIncomeBreakdown(data, snapshot) {
  const coverage = getCsvCoverage(data, snapshot.periodStart, snapshot.periodEnd)
  if (coverage.status !== 'missing') {
    const row = transactionsBetween(data, snapshot.periodStart, snapshot.periodEnd).reduce((totals, transaction) => {
      const type = transaction.type ?? ''
      const amount = Math.max(0, transaction.amount ?? 0)
      if (type === 'INTEREST_PAYMENT') totals.interestPayments += amount
      if (type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT') totals.dividendPayments += amount
      if (type === 'BENEFITS_SAVEBACK' || type === 'STOCKPERK') totals.benefitPayments += amount
      if (type === 'FINAL_MATURITY') totals.bondMaturities += amount
      return totals
    }, { interestPayments: 0, dividendPayments: 0, benefitPayments: 0, bondMaturities: 0 })

    return {
      source: 'csv',
      coverageStatus: coverage.status,
      items: [
        { key: 'interestPayments', label: 'Intereses', value: row.interestPayments },
        { key: 'dividendPayments', label: 'Dividendos', value: row.dividendPayments },
        { key: 'benefitPayments', label: 'Saveback y beneficios', value: row.benefitPayments },
        { key: 'bondMaturities', label: 'Vencimientos de bonos', value: row.bondMaturities },
      ],
      total: row.interestPayments + row.dividendPayments + row.benefitPayments + row.bondMaturities,
    }
  }

  const otherGeneratedCash = Math.max(0, snapshot.reportedGeneratedCash - snapshot.reportedInterest - snapshot.reportedBondPayments)
  return {
    source: 'manual',
    coverageStatus: coverage.status,
    items: [
      { key: 'reportedInterest', label: 'Intereses reportados', value: snapshot.reportedInterest },
      { key: 'reportedBondPayments', label: 'Bonos reportados', value: snapshot.reportedBondPayments },
      { key: 'otherGeneratedCash', label: 'Otros pagos generados', value: otherGeneratedCash },
    ],
    total: snapshot.reportedInterest + snapshot.reportedBondPayments + otherGeneratedCash,
  }
}

function calculateTradeRepublicInvestmentFlow(data, periodStart, periodEnd) {
  return sumTransactions(data, periodStart, periodEnd, (transaction) => {
    const type = transaction.type ?? ''
    if (type === 'BUY') return Math.abs(transaction.amount ?? 0)
    if (type === 'SELL' || type === 'FINAL_MATURITY') return -Math.abs(transaction.amount ?? 0)
    return 0
  })
}

function liquidInvestmentValue(snapshot) {
  return snapshot.tradeRepublicEquityValue
    + snapshot.tradeRepublicFixedIncomeValue
    + snapshot.tradeRepublicCryptoValue
    + snapshot.myInvestorEquityValue
    + snapshot.myInvestorFixedIncomeValue
    + snapshot.myInvestorCryptoValue
    + snapshot.criptanCryptoValue
}

function fixedIncomeValue(snapshot) {
  return snapshot.tradeRepublicFixedIncomeValue + snapshot.myInvestorFixedIncomeValue
}

function nonFixedInvestmentValue(snapshot) {
  return snapshot.tradeRepublicEquityValue
    + snapshot.tradeRepublicCryptoValue
    + snapshot.myInvestorEquityValue
    + snapshot.myInvestorCryptoValue
    + snapshot.criptanCryptoValue
}

function attributeLiquidInvestments(data, snapshots) {
  let previous

  return snapshots.map((snapshot) => {
    const value = liquidInvestmentValue(snapshot)
    if (!previous || snapshot.snapshotOrigin === 'historical-migration') {
      const attributed = { principal: value * 0.9, growth: value * 0.1, value }
      previous = attributed
      return attributed
    }

    const flow = calculateTradeRepublicInvestmentFlow(data, snapshot.periodStart, snapshot.periodEnd)
      + snapshot.myInvestorExternalFlow
      + snapshot.criptanExternalFlow
    const expectedAfterFlow = Math.max(0, previous.value + flow)
    const principalAfterFlow = flow >= 0
      ? previous.principal + flow
      : previous.value > 0
        ? previous.principal * expectedAfterFlow / previous.value
        : 0
    const attributed = {
      principal: Math.max(0, Math.min(value, principalAfterFlow)),
      growth: Math.max(0, value - principalAfterFlow),
      value,
    }
    previous = attributed
    return attributed
  })
}

function assetPosition({ key, category, label, value, principal, unrealizedProfit }) {
  const hasPrincipal = typeof principal === 'number'
  const hasUnrealizedProfit = typeof unrealizedProfit === 'number'
  const resolvedPrincipal = hasPrincipal
    ? principal
    : hasUnrealizedProfit
      ? value - unrealizedProfit
      : undefined
  const resolvedGrowth = resolvedPrincipal === undefined ? undefined : value - resolvedPrincipal

  return {
    key,
    category,
    label,
    value,
    principal: resolvedPrincipal,
    growth: resolvedGrowth,
    unrealizedProfit: hasUnrealizedProfit ? unrealizedProfit : resolvedGrowth,
  }
}

function snapshotAssetBreakdown(snapshot) {
  return [
    assetPosition({ key: 'caixaCash', category: 'cash', label: 'Caixa', value: snapshot.caixaBalance, principal: snapshot.caixaBalance, unrealizedProfit: 0 }),
    assetPosition({ key: 'tradeRepublicCash', category: 'cash', label: 'TR cuenta corriente', value: snapshot.tradeRepublicCashBalance, principal: snapshot.tradeRepublicCashBalance, unrealizedProfit: 0 }),
    assetPosition({ key: 'tradeRepublicEquity', category: 'equity', label: 'TR renta variable', value: snapshot.tradeRepublicEquityValue, principal: snapshot.tradeRepublicEquityPrincipal, unrealizedProfit: snapshot.tradeRepublicEquityUnrealizedProfit }),
    assetPosition({ key: 'myInvestorEquity', category: 'equity', label: 'MyInvestor renta variable', value: snapshot.myInvestorEquityValue, principal: snapshot.myInvestorEquityPrincipal, unrealizedProfit: snapshot.myInvestorEquityUnrealizedProfit }),
    assetPosition({ key: 'tradeRepublicFixedIncome', category: 'fixedIncome', label: 'TR renta fija', value: snapshot.tradeRepublicFixedIncomeValue, principal: snapshot.tradeRepublicFixedIncomePrincipal, unrealizedProfit: snapshot.tradeRepublicFixedIncomeUnrealizedProfit }),
    assetPosition({ key: 'myInvestorFixedIncome', category: 'fixedIncome', label: 'MyInvestor renta fija', value: snapshot.myInvestorFixedIncomeValue, principal: snapshot.myInvestorFixedIncomePrincipal, unrealizedProfit: snapshot.myInvestorFixedIncomeUnrealizedProfit }),
    assetPosition({ key: 'tradeRepublicCrypto', category: 'crypto', label: 'TR cripto', value: snapshot.tradeRepublicCryptoValue, principal: snapshot.tradeRepublicCryptoPrincipal, unrealizedProfit: snapshot.tradeRepublicCryptoUnrealizedProfit }),
    assetPosition({ key: 'myInvestorCrypto', category: 'crypto', label: 'MyInvestor cripto', value: snapshot.myInvestorCryptoValue, principal: snapshot.myInvestorCryptoPrincipal, unrealizedProfit: snapshot.myInvestorCryptoUnrealizedProfit }),
    assetPosition({ key: 'criptanCrypto', category: 'crypto', label: 'Criptan', value: snapshot.criptanCryptoValue, principal: snapshot.criptanCryptoPrincipal, unrealizedProfit: snapshot.criptanCryptoUnrealizedProfit }),
    assetPosition({ key: 'urbanitaeRealEstate', category: 'realEstate', label: 'Urbanitae', value: snapshot.urbanitaeRealEstateValue, principal: snapshot.urbanitaeRealEstatePrincipal, unrealizedProfit: snapshot.urbanitaeRealEstateUnrealizedProfit }),
  ]
}

function attributedLiquidInvestmentFromSnapshot(snapshot, fallback) {
  const breakdown = snapshotAssetBreakdown(snapshot)
  const liquidAssets = breakdown.filter((asset) => asset.category === 'equity' || asset.category === 'fixedIncome' || asset.category === 'crypto')
  if (liquidAssets.some((asset) => typeof asset.principal === 'number')) {
    const principal = liquidAssets.reduce((sum, asset) => sum + (asset.principal ?? asset.value), 0)
    const value = liquidAssets.reduce((sum, asset) => sum + asset.value, 0)
    return { principal: Math.max(0, Math.min(value, principal)), growth: Math.max(0, value - principal), value }
  }
  return fallback
}

function attributedNonFixedInvestmentFromSnapshot(snapshot, fallback) {
  const breakdown = snapshotAssetBreakdown(snapshot)
  const nonFixedAssets = breakdown.filter((asset) => asset.category === 'equity' || asset.category === 'crypto')
  if (nonFixedAssets.some((asset) => typeof asset.principal === 'number')) {
    const principal = nonFixedAssets.reduce((sum, asset) => sum + (asset.principal ?? asset.value), 0)
    const value = nonFixedAssets.reduce((sum, asset) => sum + asset.value, 0)
    return { principal: Math.max(0, Math.min(value, principal)), growth: value - principal, value }
  }

  const fixedIncome = fixedIncomeValue(snapshot)
  const nonFixedValue = nonFixedInvestmentValue(snapshot)
  const fallbackValue = fallback.value || liquidInvestmentValue(snapshot)
  const fixedShare = fallbackValue ? fixedIncome / fallbackValue : 0
  const principal = Math.max(0, fallback.principal * (1 - fixedShare))
  return {
    principal: Math.min(nonFixedValue, principal),
    growth: nonFixedValue - principal,
    value: nonFixedValue,
  }
}

function marketGrowth(snapshot) {
  if (snapshot.snapshotOrigin === 'historical-visual') return undefined

  const marketAssets = snapshotAssetBreakdown(snapshot)
    .filter((asset) => asset.category === 'equity' || asset.category === 'crypto')
  if (marketAssets.some((asset) => asset.value > 0 && typeof asset.principal !== 'number')) return undefined

  return marketAssets.reduce((sum, asset) => sum + (asset.growth ?? 0), 0)
}

function marketChangeForSnapshot(snapshot, previousReliableSnapshot) {
  const currentGrowth = marketGrowth(snapshot)
  if (currentGrowth === undefined) return undefined
  if (snapshot.snapshotOrigin === 'baseline') return 0

  const previousGrowth = previousReliableSnapshot ? marketGrowth(previousReliableSnapshot) : undefined
  return previousGrowth === undefined ? undefined : currentGrowth - previousGrowth
}

function passiveIncome(snapshot) {
  return snapshot.reportedInterest + snapshot.reportedBondPayments
}

export function getDashboard(data) {
  const snapshots = [...data.monthlySnapshots].sort((left, right) => left.month.localeCompare(right.month))

  if (snapshots.length === 0) return { snapshots: [], summary: undefined }

  const latest = snapshots.at(-1)
  const previous = snapshots.at(-2)
  const currentNetWorth = snapshotNetWorth(latest)
  const previousNetWorth = previous ? snapshotNetWorth(previous) : undefined
  const monthlyChange = previousNetWorth === undefined ? undefined : currentNetWorth - previousNetWorth
  const tradeRepublicExternalFlow = calculateTradeRepublicExternalFlow(data, latest.periodStart, latest.periodEnd)
  const netContribution = tradeRepublicExternalFlow + latest.myInvestorExternalFlow + latest.urbanitaeExternalFlow
  const detectedYields = calculateDetectedYields(data, latest.periodStart, latest.periodEnd)

  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const investmentAttribution = attributeLiquidInvestments(data, snapshots)
  let previousReliableSnapshot
  const stacks = snapshots.map((snapshot, index) => {
    const previousSnapshot = snapshots[index - 1]
    const previousSnapshotNetWorth = previousSnapshot ? snapshotNetWorth(previousSnapshot) : undefined
    const snapshotTotalNetWorth = snapshotNetWorth(snapshot)
    const snapshotMonthlyChange = previousSnapshotNetWorth === undefined ? undefined : snapshotTotalNetWorth - previousSnapshotNetWorth
    const cash = snapshot.caixaBalance + snapshot.tradeRepublicCashBalance
    const cashFromYields = Math.min(cash, snapshot.reportedGeneratedCash)
    const investments = attributedNonFixedInvestmentFromSnapshot(snapshot, attributedLiquidInvestmentFromSnapshot(snapshot, investmentAttribution[index]))
    const fixedIncome = fixedIncomeValue(snapshot)
    const marketGrowthValue = marketGrowth(snapshot)
    const marketChange = marketChangeForSnapshot(snapshot, previousReliableSnapshot)
    const passiveIncomeValue = passiveIncome(snapshot)
    const passiveIncomeYtd = snapshots
      .filter((candidate) => candidate.month.slice(0, 4) === snapshot.month.slice(0, 4) && candidate.month <= snapshot.month)
      .reduce((sum, candidate) => sum + passiveIncome(candidate), 0)
    if (snapshot.snapshotOrigin === 'baseline' || snapshot.snapshotOrigin === 'tracked') previousReliableSnapshot = snapshot

    return {
      month: snapshot.month,
      snapshotOrigin: snapshot.snapshotOrigin,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      label: monthLabels[Number(snapshot.month.slice(5, 7)) - 1],
      cashFromSalary: cash - cashFromYields,
      cashFromYields,
      fixedIncome,
      investedPrincipal: investments.principal,
      investedGrowth: investments.growth,
      realEstatePrincipal: snapshot.urbanitaeRealEstateValue,
      totalNetWorth: snapshotTotalNetWorth,
      monthlyChange: snapshotMonthlyChange,
      monthlyChangePercent: previousSnapshotNetWorth ? snapshotMonthlyChange / previousSnapshotNetWorth * 100 : undefined,
      marketGrowth: marketGrowthValue,
      marketChange,
      passiveIncome: passiveIncomeValue,
      passiveIncomeYtd,
      assetBreakdown: snapshotAssetBreakdown(snapshot),
      incomeBreakdown: calculateIncomeBreakdown(data, snapshot),
      savingsBreakdown: {
        myInvestor: snapshot.myInvestorExternalFlow,
        criptan: snapshot.criptanExternalFlow,
        urbanitae: snapshot.urbanitaeExternalFlow,
        total: snapshot.myInvestorExternalFlow + snapshot.criptanExternalFlow + snapshot.urbanitaeExternalFlow,
      },
    }
  })

  return {
    snapshots: stacks,
    summary: {
      latestMonth: latest.month,
      currentNetWorth,
      monthlyChange,
      monthlyChangePercent: previousNetWorth ? monthlyChange / previousNetWorth * 100 : undefined,
      netContribution,
      estimatedReturn: monthlyChange === undefined ? undefined : monthlyChange - netContribution,
      detectedYields,
      marketGrowth: stacks.at(-1).marketGrowth,
      marketChange: stacks.at(-1).marketChange,
      passiveIncome: stacks.at(-1).passiveIncome,
      passiveIncomeYtd: stacks.at(-1).passiveIncomeYtd,
      attributionReady: true,
      assets: [
        { label: 'Cash', value: latest.caixaBalance + latest.tradeRepublicCashBalance, color: '#2f5f91' },
        { label: 'Renta variable', value: latest.tradeRepublicEquityValue + latest.myInvestorEquityValue, color: '#3f7b5e' },
        { label: 'Renta fija', value: latest.tradeRepublicFixedIncomeValue + latest.myInvestorFixedIncomeValue, color: '#75a58a' },
        { label: 'Cripto', value: latest.tradeRepublicCryptoValue + latest.myInvestorCryptoValue + latest.criptanCryptoValue, color: '#b1d5bf' },
        { label: 'Inmobiliario', value: latest.urbanitaeRealEstateValue, color: '#c48a67' },
      ],
    },
  }
}

