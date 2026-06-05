function parseSpanishNumber(value = '') {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDate(value = '') {
  const [day, month, year] = value.trim().split('/').map(Number)
  if (!day || !month || !year) return undefined
  return new Date(Date.UTC(year, month - 1, day))
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function monthlyPeriod(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const nextMonth = new Date(Date.UTC(year, monthNumber, 3))
  return {
    periodStart: `${month}-04`,
    periodEnd: isoDate(nextMonth),
  }
}

function parsePercent(value = '') {
  return value.includes('%') ? parseSpanishNumber(value) : undefined
}

function normalizeAllocation(allocation) {
  const total = allocation.fixedIncome + allocation.equity + allocation.crypto
  return {
    fixedIncome: allocation.fixedIncome / total,
    equity: allocation.equity / total,
    crypto: allocation.crypto / total,
  }
}

export function parseTradeRepublicEquityAdjustments(text = '') {
  const adjustments = new Map()
  const lines = text.trim().split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    const cells = line.split(/[;,\t]/).map((cell) => cell.trim())
    const month = cells[0]
    if (!/^\d{4}-\d{2}$/.test(month)) continue

    const tradeRepublicEquityValue = parseSpanishNumber(cells[1])
    const tradeRepublicEquityUnrealizedProfit = parseSpanishNumber(cells[2])
    if (!Number.isFinite(tradeRepublicEquityValue) || !Number.isFinite(tradeRepublicEquityUnrealizedProfit)) continue
    if (tradeRepublicEquityValue <= 0) continue

    adjustments.set(month, {
      tradeRepublicEquityValue,
      tradeRepublicEquityUnrealizedProfit,
      tradeRepublicEquityPrincipal: tradeRepublicEquityValue - tradeRepublicEquityUnrealizedProfit,
    })
  }

  return adjustments
}

export function parseHistoricalSnapshots(text, tradeRepublicEquityAdjustmentsText = '') {
  const tradeRepublicEquityAdjustments = parseTradeRepublicEquityAdjustments(tradeRepublicEquityAdjustmentsText)
  const selectedByMonth = new Map()
  const rows = text.trim().split(/\r?\n/).slice(1)

  for (const line of rows) {
    const cells = line.split('\t')
    const date = parseDate(cells[0])
    if (!date) continue
    const month = isoDate(date).slice(0, 7)
    const previous = selectedByMonth.get(month)
    if (!previous || previous.date < date) selectedByMonth.set(month, { cells, date })
  }

  const selected = [...selectedByMonth.entries()]
    .filter(([month]) => month >= '2024-09' && month <= '2026-05')
    .sort(([left], [right]) => left.localeCompare(right))

  const allocations = selected.map(([, { cells }]) => {
    const fixedIncome = parsePercent(cells[24])
    const equity = parsePercent(cells[25])
    const crypto = parsePercent(cells[26])
    return fixedIncome === undefined || equity === undefined || crypto === undefined
      ? undefined
      : normalizeAllocation({ fixedIncome, equity, crypto })
  })
  const firstAllocation = allocations.find(Boolean)
  if (!firstAllocation) throw new Error('No se han encontrado porcentajes históricos de TR.')

  let currentAllocation = firstAllocation
  return selected.map(([month, { cells }], index) => {
    currentAllocation = allocations[index] ?? currentAllocation
    const value = (cellIndex) => parseSpanishNumber(cells[cellIndex])
    const tradeRepublicInvestmentValue = value(5)
    const { periodStart, periodEnd } = monthlyPeriod(month)
    const equityAdjustment = tradeRepublicEquityAdjustments.get(month)
    if (equityAdjustment && equityAdjustment.tradeRepublicEquityValue > tradeRepublicInvestmentValue) {
      throw new Error(`El ajuste TR RV de ${month} supera el total de TR inversion.`)
    }
    const remainingAllocation = currentAllocation.fixedIncome + currentAllocation.crypto
    const tradeRepublicEquityValue = equityAdjustment?.tradeRepublicEquityValue ?? tradeRepublicInvestmentValue * currentAllocation.equity
    const tradeRepublicRemainingValue = Math.max(0, tradeRepublicInvestmentValue - tradeRepublicEquityValue)
    const tradeRepublicFixedIncomeValue = equityAdjustment && remainingAllocation > 0
      ? tradeRepublicRemainingValue * currentAllocation.fixedIncome / remainingAllocation
      : tradeRepublicInvestmentValue * currentAllocation.fixedIncome
    const tradeRepublicCryptoValue = equityAdjustment && remainingAllocation > 0
      ? tradeRepublicRemainingValue * currentAllocation.crypto / remainingAllocation
      : tradeRepublicInvestmentValue * currentAllocation.crypto

    return {
      month,
      periodStart,
      periodEnd,
      caixaBalance: value(1),
      tradeRepublicCashBalance: value(6),
      tradeRepublicEquityValue,
      tradeRepublicEquityPrincipal: equityAdjustment?.tradeRepublicEquityPrincipal,
      tradeRepublicEquityUnrealizedProfit: equityAdjustment?.tradeRepublicEquityUnrealizedProfit,
      tradeRepublicFixedIncomeValue,
      tradeRepublicCryptoValue,
      myInvestorEquityValue: value(2),
      myInvestorFixedIncomeValue: 0,
      myInvestorCryptoValue: 0,
      criptanCryptoValue: value(3),
      myInvestorExternalFlow: 0,
      urbanitaeRealEstateValue: value(4),
      urbanitaeExternalFlow: 0,
      reportedInterest: value(15),
      reportedBondPayments: value(16),
      reportedGeneratedCash: value(17),
      snapshotOrigin: 'historical-migration',
    }
  })
}
