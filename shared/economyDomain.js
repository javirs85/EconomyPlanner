export const baselineMonth = '2026-05'

const inboundTypes = new Set(['CUSTOMER_INBOUND', 'TRANSFER_INBOUND', 'TRANSFER_INSTANT_INBOUND'])
const outboundTypes = new Set(['CUSTOMER_OUTBOUND', 'TRANSFER_OUTBOUND', 'TRANSFER_INSTANT_OUTBOUND'])
const cardTypes = new Set(['CARD_TRANSACTION', 'CARD_TRANSACTION_INTERNATIONAL'])
const generatedCashTypes = new Set(['INTEREST_PAYMENT', 'DIVIDEND', 'DIVIDEND_PAYMENT'])

export function netAmount(transaction) {
  return (transaction.amount ?? 0) + (transaction.tax ?? 0) + (transaction.fee ?? 0)
}

export function positionProfit({ principal = 0, value = 0 }) {
  return value - principal
}

export function classifyTradeRepublicTransactions(transactions, periodStart, periodEnd) {
  const facts = {
    tradeRepublicCashContribution: 0,
    tradeRepublicEquityFlow: 0,
    tradeRepublicFixedIncomeFlow: 0,
    tradeRepublicCryptoFlow: 0,
    generatedCash: 0,
    generatedCashItems: [],
    cardExpenses: 0,
    ignoredOutbounds: [],
  }

  for (const transaction of transactions) {
    if (periodStart && transaction.date < periodStart) continue
    if (periodEnd && transaction.date > periodEnd) continue

    const type = transaction.type ?? ''
    const assetClass = transaction.assetClass ?? ''
    const amount = netAmount(transaction)
    const absoluteAmount = Math.abs(amount)

    if (generatedCashTypes.has(type)) {
      facts.generatedCash += amount
      facts.generatedCashItems.push({
        key: transaction.transactionId ?? `${transaction.date}-${type}-${facts.generatedCashItems.length}`,
        date: transaction.date,
        label: generatedCashLabel(transaction),
        detail: generatedCashDetail(transaction),
        value: amount,
      })
      continue
    }

    if (inboundTypes.has(type)) {
      facts.tradeRepublicCashContribution += amount
      continue
    }

    if (outboundTypes.has(type)) {
      facts.ignoredOutbounds.push({
        date: transaction.date,
        amount: absoluteAmount,
        description: transaction.description ?? transaction.name ?? '',
        counterpartyName: transaction.counterpartyName,
        paymentReference: transaction.paymentReference,
      })
      continue
    }

    if (cardTypes.has(type)) {
      facts.cardExpenses += -amount
      continue
    }

    if (type === 'BUY') {
      addInvestmentFlow(facts, assetClass, absoluteAmount)
      continue
    }

    if (type === 'SELL') {
      addInvestmentFlow(facts, assetClass, -absoluteAmount)
      continue
    }

    if (type === 'FINAL_MATURITY') {
      if (assetClass === 'BOND' && transaction.category === 'CASH') facts.tradeRepublicFixedIncomeFlow -= absoluteAmount
      continue
    }

    if (type === 'BENEFITS_SAVEBACK') {
      addInvestmentFlow(facts, assetClass || 'CRYPTO', absoluteAmount)
      continue
    }

    if (type === 'STOCKPERK') {
      addInvestmentFlow(facts, 'STOCK', absoluteAmount)
    }
  }

  facts.cardExpenses = Math.max(0, facts.cardExpenses)
  return facts
}

function generatedCashLabel(transaction) {
  const type = transaction.type ?? ''
  if (type === 'INTEREST_PAYMENT' && transaction.assetClass === 'BOND') return 'Cupón bono'
  if (type === 'INTEREST_PAYMENT') return 'Intereses'
  if (type === 'DIVIDEND' || type === 'DIVIDEND_PAYMENT') return 'Dividendo'
  return 'Rendimiento'
}

function generatedCashDetail(transaction) {
  const type = transaction.type ?? ''
  if (type === 'INTEREST_PAYMENT' && transaction.assetClass === 'BOND') return transaction.name ?? ''
  if (type === 'INTEREST_PAYMENT') return ''
  return transaction.name ?? transaction.description ?? ''
}

function addInvestmentFlow(facts, assetClass, amount) {
  if (assetClass === 'BOND') {
    facts.tradeRepublicFixedIncomeFlow += amount
    return
  }
  if (assetClass === 'CRYPTO') {
    facts.tradeRepublicCryptoFlow += amount
    return
  }
  if (assetClass === 'FUND' || assetClass === 'STOCK') facts.tradeRepublicEquityFlow += amount
}

export function snapshotOriginForMonth(month) {
  if (month < baselineMonth) return 'historical-visual'
  if (month === baselineMonth) return 'baseline'
  return 'tracked'
}

export function normalizeSnapshotOrigin(origin, month) {
  if (origin === 'historical-visual' || origin === 'baseline' || origin === 'tracked') return origin
  return snapshotOriginForMonth(month)
}

export function isPrincipalBaseline(snapshot, previousSnapshot) {
  return snapshot.month <= baselineMonth || !previousSnapshot
}

export function resolveSnapshotPrincipals(snapshot, previousSnapshot, tradeRepublicFacts = {}) {
  const baseline = isPrincipalBaseline(snapshot, previousSnapshot)
  return {
    tradeRepublicEquityPrincipal: suppliedOrCalculatedPrincipal(snapshot.tradeRepublicEquityPrincipal, baseline
      ? snapshot.tradeRepublicEquityValue
      : flowAdjustedPrincipal(previousSnapshot.tradeRepublicEquityPrincipal, previousSnapshot.tradeRepublicEquityValue, tradeRepublicFacts.tradeRepublicEquityFlow)),
    tradeRepublicFixedIncomePrincipal: suppliedOrCalculatedPrincipal(snapshot.tradeRepublicFixedIncomePrincipal, baseline
      ? snapshot.tradeRepublicFixedIncomeValue
      : flowAdjustedPrincipal(previousSnapshot.tradeRepublicFixedIncomePrincipal, previousSnapshot.tradeRepublicFixedIncomeValue, tradeRepublicFacts.tradeRepublicFixedIncomeFlow)),
    tradeRepublicCryptoPrincipal: suppliedOrCalculatedPrincipal(snapshot.tradeRepublicCryptoPrincipal, baseline
      ? snapshot.tradeRepublicCryptoValue
      : flowAdjustedPrincipal(previousSnapshot.tradeRepublicCryptoPrincipal, previousSnapshot.tradeRepublicCryptoValue, tradeRepublicFacts.tradeRepublicCryptoFlow)),
    myInvestorEquityPrincipal: suppliedOrCalculatedPrincipal(snapshot.myInvestorEquityPrincipal, baseline
      ? snapshot.myInvestorEquityValue
      : flowAdjustedPrincipal(previousSnapshot.myInvestorEquityPrincipal, previousSnapshot.myInvestorEquityValue, snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0)),
    myInvestorFixedIncomePrincipal: suppliedOrCalculatedPrincipal(snapshot.myInvestorFixedIncomePrincipal, baseline
      ? snapshot.myInvestorFixedIncomeValue
      : flowAdjustedPrincipal(previousSnapshot.myInvestorFixedIncomePrincipal, previousSnapshot.myInvestorFixedIncomeValue, snapshot.myInvestorFixedIncomeExternalFlow ?? 0)),
    myInvestorCryptoPrincipal: suppliedOrCalculatedPrincipal(snapshot.myInvestorCryptoPrincipal, baseline
      ? snapshot.myInvestorCryptoValue
      : flowAdjustedPrincipal(previousSnapshot.myInvestorCryptoPrincipal, previousSnapshot.myInvestorCryptoValue, snapshot.myInvestorCryptoExternalFlow ?? 0)),
    urbanitaeRealEstatePrincipal: suppliedOrCalculatedPrincipal(snapshot.urbanitaeRealEstatePrincipal, baseline
      ? snapshot.urbanitaeRealEstateValue
      : flowAdjustedPrincipal(previousSnapshot.urbanitaeRealEstatePrincipal, previousSnapshot.urbanitaeRealEstateValue, snapshot.urbanitaeExternalFlow ?? 0)),
  }
}

function suppliedOrCalculatedPrincipal(supplied, calculated = 0) {
  return Math.max(0, typeof supplied === 'number' && Number.isFinite(supplied) ? supplied : (calculated ?? 0))
}

function flowAdjustedPrincipal(previousPrincipal, previousValue, flow = 0) {
  return Math.max(0, (previousPrincipal ?? previousValue ?? 0) + flow)
}

export function myInvestorExternalFlow(snapshot) {
  return (snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0)
    + (snapshot.myInvestorFixedIncomeExternalFlow ?? 0)
    + (snapshot.myInvestorCryptoExternalFlow ?? 0)
}

export function totalManualExternalFlow(snapshot) {
  return myInvestorExternalFlow(snapshot)
    + (snapshot.criptanExternalFlow ?? 0)
    + (snapshot.urbanitaeExternalFlow ?? 0)
}

export function totalTradeRepublicInvestmentFlow(snapshot) {
  return (snapshot.tradeRepublicEquityFlow ?? 0)
    + (snapshot.tradeRepublicFixedIncomeFlow ?? 0)
    + (snapshot.tradeRepublicCryptoFlow ?? 0)
}

export function snapshotNetWorth(snapshot) {
  return (snapshot.caixaBalance ?? 0)
    + (snapshot.tradeRepublicCashBalance ?? 0)
    + (snapshot.tradeRepublicEquityValue ?? 0)
    + (snapshot.tradeRepublicFixedIncomeValue ?? 0)
    + (snapshot.tradeRepublicCryptoValue ?? 0)
    + (snapshot.myInvestorEquityValue ?? 0)
    + (snapshot.myInvestorFixedIncomeValue ?? 0)
    + (snapshot.myInvestorCryptoValue ?? 0)
    + (snapshot.criptanCryptoValue ?? 0)
    + (snapshot.urbanitaeRealEstateValue ?? 0)
}

function principalValueAsset({ key, category, label, value, principal }) {
  const resolvedPrincipal = typeof principal === 'number' ? principal : value
  const growth = value - resolvedPrincipal
  return {
    key,
    category,
    label,
    value,
    principal: resolvedPrincipal,
    growth,
    unrealizedProfit: growth,
  }
}

function depositAsset({ key, category, label, value }) {
  return {
    key,
    category,
    label,
    value,
    principal: value,
    growth: 0,
    unrealizedProfit: 0,
  }
}

function categoryChartSegments(assets, category, reliable) {
  const categoryAssets = assets.filter((asset) => asset.category === category)
  const value = categoryAssets.reduce((sum, asset) => sum + asset.value, 0)
  const growth = categoryAssets.reduce((sum, asset) => sum + (asset.growth ?? 0), 0)
  const generated = reliable ? Math.min(value, Math.max(0, growth)) : 0

  return {
    value,
    growth,
    base: value - generated,
    generated,
  }
}

export function snapshotAssetBreakdown(snapshot) {
  return [
    depositAsset({ key: 'caixaCash', category: 'cash', label: 'Caixa', value: snapshot.caixaBalance ?? 0 }),
    depositAsset({ key: 'tradeRepublicCash', category: 'cash', label: 'TR cuenta corriente', value: snapshot.tradeRepublicCashBalance ?? 0 }),
    principalValueAsset({ key: 'tradeRepublicEquity', category: 'equity', label: 'TR renta variable', value: snapshot.tradeRepublicEquityValue ?? 0, principal: snapshot.tradeRepublicEquityPrincipal }),
    principalValueAsset({ key: 'myInvestorEquity', category: 'equity', label: 'MyInvestor renta variable', value: snapshot.myInvestorEquityValue ?? 0, principal: snapshot.myInvestorEquityPrincipal }),
    principalValueAsset({ key: 'tradeRepublicFixedIncome', category: 'fixedIncome', label: 'TR renta fija', value: snapshot.tradeRepublicFixedIncomeValue ?? 0, principal: snapshot.tradeRepublicFixedIncomePrincipal }),
    principalValueAsset({ key: 'myInvestorFixedIncome', category: 'fixedIncome', label: 'MyInvestor renta fija', value: snapshot.myInvestorFixedIncomeValue ?? 0, principal: snapshot.myInvestorFixedIncomePrincipal }),
    principalValueAsset({ key: 'tradeRepublicCrypto', category: 'crypto', label: 'TR cripto', value: snapshot.tradeRepublicCryptoValue ?? 0, principal: snapshot.tradeRepublicCryptoPrincipal }),
    principalValueAsset({ key: 'myInvestorCrypto', category: 'crypto', label: 'MyInvestor cripto', value: snapshot.myInvestorCryptoValue ?? 0, principal: snapshot.myInvestorCryptoPrincipal }),
    depositAsset({ key: 'criptanCrypto', category: 'crypto', label: 'Criptan', value: snapshot.criptanCryptoValue ?? 0 }),
    principalValueAsset({ key: 'urbanitaeRealEstate', category: 'realEstate', label: 'Urbanitae', value: snapshot.urbanitaeRealEstateValue ?? 0, principal: snapshot.urbanitaeRealEstatePrincipal }),
  ]
}

export function fixedIncomeValue(snapshot) {
  return (snapshot.tradeRepublicFixedIncomeValue ?? 0) + (snapshot.myInvestorFixedIncomeValue ?? 0)
}

export function marketGrowth(snapshot) {
  if (snapshot.snapshotOrigin === 'historical-visual') return undefined
  return snapshotAssetBreakdown(snapshot)
    .filter((asset) => asset.category === 'equity' || asset.category === 'fixedIncome' || asset.category === 'crypto' || asset.category === 'realEstate')
    .reduce((sum, asset) => sum + (asset.growth ?? 0), 0)
}

export function marketChangeForSnapshot(snapshot, previousReliableSnapshot) {
  const currentGrowth = marketGrowth(snapshot)
  if (currentGrowth === undefined) return undefined
  if (snapshot.snapshotOrigin === 'baseline') return 0

  const previousGrowth = previousReliableSnapshot ? marketGrowth(previousReliableSnapshot) : undefined
  return previousGrowth === undefined ? undefined : currentGrowth - previousGrowth
}

function transactionIncomeBreakdown(snapshot, transactions) {
  if (!transactions) return undefined
  const facts = classifyTradeRepublicTransactions(transactions, snapshot.periodStart, snapshot.periodEnd)
  if (facts.generatedCashItems.length === 0) return undefined

  return {
    source: 'csv',
    coverageStatus: 'complete',
    items: facts.generatedCashItems,
    total: facts.generatedCash,
  }
}

function snapshotIncomeBreakdown(snapshot, passiveIncomeValue) {
  const items = []
  if ((snapshot.reportedInterest ?? 0) > 0) {
    items.push({ key: `${snapshot.month}-reported-interest`, label: 'Intereses reportados', value: snapshot.reportedInterest })
  }
  if ((snapshot.reportedBondPayments ?? 0) > 0) {
    items.push({ key: `${snapshot.month}-reported-bonds`, label: 'Bonos reportados', value: snapshot.reportedBondPayments })
  }
  const knownTotal = items.reduce((sum, item) => sum + item.value, 0)
  if (passiveIncomeValue > knownTotal) {
    items.push({ key: `${snapshot.month}-other-generated-cash`, label: 'Otros rendimientos', value: passiveIncomeValue - knownTotal })
  }
  if (items.length === 0 && passiveIncomeValue > 0) {
    items.push({ key: `${snapshot.month}-generated-cash`, label: 'Rendimientos recibidos', value: passiveIncomeValue })
  }

  return {
    source: 'snapshot',
    coverageStatus: items.length > 0 ? 'complete' : 'missing',
    items,
    total: passiveIncomeValue,
  }
}

export function calculateDashboard(snapshots, options = {}) {
  const transactions = options.transactions
  const orderedSnapshots = [...snapshots].sort((left, right) => left.month.localeCompare(right.month))
  if (orderedSnapshots.length === 0) return { snapshots: [], summary: undefined }

  const latest = orderedSnapshots.at(-1)
  const previous = orderedSnapshots.at(-2)
  const currentNetWorth = snapshotNetWorth(latest)
  const previousNetWorth = previous ? snapshotNetWorth(previous) : undefined
  const monthlyChange = previousNetWorth === undefined ? undefined : currentNetWorth - previousNetWorth
  const netContribution = (latest.tradeRepublicCashContribution ?? 0)
    + totalManualExternalFlow(latest)

  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  let previousReliableSnapshot
  const stacks = orderedSnapshots.map((snapshot, index) => {
    const previousSnapshot = orderedSnapshots[index - 1]
    const previousSnapshotNetWorth = previousSnapshot ? snapshotNetWorth(previousSnapshot) : undefined
    const snapshotTotalNetWorth = snapshotNetWorth(snapshot)
    const snapshotMonthlyChange = previousSnapshotNetWorth === undefined ? undefined : snapshotTotalNetWorth - previousSnapshotNetWorth
    const cash = (snapshot.caixaBalance ?? 0) + (snapshot.tradeRepublicCashBalance ?? 0)
    const cashFromYields = Math.min(cash, snapshot.generatedCash ?? snapshot.reportedGeneratedCash ?? 0)
    const assetBreakdown = snapshotAssetBreakdown(snapshot)
    const reliableComposition = snapshot.snapshotOrigin !== 'historical-visual'
    const equityComposition = categoryChartSegments(assetBreakdown, 'equity', reliableComposition)
    const cryptoComposition = categoryChartSegments(assetBreakdown, 'crypto', reliableComposition)
    const investedPrincipal = assetBreakdown
      .filter((asset) => asset.category === 'equity' || asset.category === 'crypto')
      .reduce((sum, asset) => sum + (asset.principal ?? asset.value), 0)
    const investedValue = assetBreakdown
      .filter((asset) => asset.category === 'equity' || asset.category === 'crypto')
      .reduce((sum, asset) => sum + asset.value, 0)
    const realEstatePrincipal = assetBreakdown
      .filter((asset) => asset.category === 'realEstate')
      .reduce((sum, asset) => sum + (asset.principal ?? asset.value), 0)
    const marketGrowthValue = marketGrowth(snapshot)
    const marketChange = marketChangeForSnapshot(snapshot, previousReliableSnapshot)
    const passiveIncomeValue = snapshot.generatedCash ?? snapshot.reportedGeneratedCash ?? 0
    const passiveIncomeYtd = orderedSnapshots
      .filter((candidate) => candidate.month.slice(0, 4) === snapshot.month.slice(0, 4) && candidate.month <= snapshot.month)
      .reduce((sum, candidate) => sum + (candidate.generatedCash ?? candidate.reportedGeneratedCash ?? 0), 0)
    const incomeBreakdown = transactionIncomeBreakdown(snapshot, transactions)
      ?? snapshotIncomeBreakdown(snapshot, passiveIncomeValue)
    if (snapshot.snapshotOrigin === 'baseline' || snapshot.snapshotOrigin === 'tracked') previousReliableSnapshot = snapshot

    return {
      month: snapshot.month,
      snapshotOrigin: snapshot.snapshotOrigin,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      label: monthLabels[Number(snapshot.month.slice(5, 7)) - 1],
      cashFromSalary: cash - cashFromYields,
      cashFromYields,
      fixedIncome: fixedIncomeValue(snapshot),
      equityValue: equityComposition.value,
      equityGrowth: equityComposition.growth,
      equityBase: equityComposition.base,
      equityGenerated: equityComposition.generated,
      cryptoValue: cryptoComposition.value,
      cryptoGrowth: cryptoComposition.growth,
      cryptoBase: cryptoComposition.base,
      cryptoGenerated: cryptoComposition.generated,
      investedPrincipal,
      investedGrowth: investedValue - investedPrincipal,
      realEstatePrincipal,
      realEstateValue: assetBreakdown
        .filter((asset) => asset.category === 'realEstate')
        .reduce((sum, asset) => sum + asset.value, 0),
      totalNetWorth: snapshotTotalNetWorth,
      monthlyChange: snapshotMonthlyChange,
      monthlyChangePercent: previousSnapshotNetWorth ? snapshotMonthlyChange / previousSnapshotNetWorth * 100 : undefined,
      marketGrowth: marketGrowthValue,
      marketChange,
      passiveIncome: passiveIncomeValue,
      passiveIncomeYtd,
      assetBreakdown,
      incomeBreakdown,
      savingsBreakdown: {
        tradeRepublicCashContribution: snapshot.tradeRepublicCashContribution ?? 0,
        tradeRepublicEquity: snapshot.tradeRepublicEquityFlow ?? 0,
        tradeRepublicFixedIncome: snapshot.tradeRepublicFixedIncomeFlow ?? 0,
        tradeRepublicCrypto: snapshot.tradeRepublicCryptoFlow ?? 0,
        myInvestor: myInvestorExternalFlow(snapshot),
        myInvestorEquity: snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0,
        myInvestorFixedIncome: snapshot.myInvestorFixedIncomeExternalFlow ?? 0,
        myInvestorCrypto: snapshot.myInvestorCryptoExternalFlow ?? 0,
        criptan: snapshot.criptanExternalFlow ?? 0,
        urbanitae: snapshot.urbanitaeExternalFlow ?? 0,
        total: (snapshot.tradeRepublicCashContribution ?? 0) + totalManualExternalFlow(snapshot),
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
      detectedYields: latest.generatedCash ?? latest.reportedGeneratedCash ?? 0,
      marketGrowth: stacks.at(-1).marketGrowth,
      marketChange: stacks.at(-1).marketChange,
      passiveIncome: stacks.at(-1).passiveIncome,
      passiveIncomeYtd: stacks.at(-1).passiveIncomeYtd,
      attributionReady: true,
      assets: [
        { label: 'Cash', value: (latest.caixaBalance ?? 0) + (latest.tradeRepublicCashBalance ?? 0), color: '#2f5f91' },
        { label: 'Renta variable', value: (latest.tradeRepublicEquityValue ?? 0) + (latest.myInvestorEquityValue ?? 0), color: '#3f7b5e' },
        { label: 'Renta fija', value: fixedIncomeValue(latest), color: '#75a58a' },
        { label: 'Cripto', value: (latest.tradeRepublicCryptoValue ?? 0) + (latest.myInvestorCryptoValue ?? 0) + (latest.criptanCryptoValue ?? 0), color: '#b1d5bf' },
        { label: 'Inmobiliario', value: latest.urbanitaeRealEstateValue ?? 0, color: '#c48a67' },
      ],
    },
  }
}
