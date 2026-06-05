export interface HistoricalPreviewRow {
  month: string
  sourceDate: string
  caixaBalance: number
  tradeRepublicCashBalance: number
  tradeRepublicInvestmentValue: number
  myInvestorValue: number
  criptanCryptoValue: number
  urbanitaeRealEstateValue: number
  reportedInterest: number
  reportedBondPayments: number
  reportedGeneratedCash: number
  reportedGoldValue: number
  reportedEquityValue: number
  reportedEquityExGoldValue: number
  reportedFixedIncomeValue: number
  reportedCryptoValue: number
  reportedRealEstateValue: number
  tradeRepublicEquityAdjustmentValue?: number
  tradeRepublicEquityAdjustmentUnrealizedProfit?: number
  tradeRepublicEquityAdjustmentPrincipal?: number
  recalculatedNetWorth: number
  reportedNetWorth: number
  difference: number
  sourceRowsInMonth: number
}

export interface HistoricalPreview {
  sourceRowCount: number
  selectedRowCount: number
  ignoredRowCount: number
  rows: HistoricalPreviewRow[]
}

function parseSpanishNumber(value = '') {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDate(value: string) {
  const [day, month, year] = value.trim().split('/').map(Number)
  if (!day || !month || !year) return undefined
  return new Date(year, month - 1, day)
}

function parseTradeRepublicEquityAdjustments(text = '') {
  const adjustments = new Map<string, {
    value: number
    unrealizedProfit: number
    principal: number
  }>()
  const lines = text.trim().split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    const cells = line.split(/[;,\t]/).map((cell) => cell.trim())
    const month = cells[0]
    if (!/^\d{4}-\d{2}$/.test(month)) continue

    const value = parseSpanishNumber(cells[1])
    const unrealizedProfit = parseSpanishNumber(cells[2])
    if (value <= 0) continue

    adjustments.set(month, {
      value,
      unrealizedProfit,
      principal: value - unrealizedProfit,
    })
  }

  return adjustments
}

function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseHistoricalPaste(text: string, tradeRepublicEquityAdjustmentsText = ''): HistoricalPreview {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('Pega la tabla completa, incluida la cabecera.')
  const tradeRepublicEquityAdjustments = parseTradeRepublicEquityAdjustments(tradeRepublicEquityAdjustmentsText)

  const parsedRows = lines.slice(1)
    .map((line) => line.split('\t'))
    .map((cells) => ({ cells, date: parseDate(cells[0] ?? '') }))
    .filter((row): row is { cells: string[]; date: Date } => Boolean(row.date))

  const rowsByMonth = new Map<string, Array<{ cells: string[]; date: Date }>>()
  for (const row of parsedRows) {
    const month = localIsoDate(row.date).slice(0, 7)
    rowsByMonth.set(month, [...(rowsByMonth.get(month) ?? []), row])
  }

  const rows = [...rowsByMonth.entries()]
    .map(([month, monthRows]) => {
      const selected = [...monthRows].sort((left, right) => left.date.getTime() - right.date.getTime()).at(-1)!
      const value = (index: number) => parseSpanishNumber(selected.cells[index])
      const caixaBalance = value(1)
      const myInvestorValue = value(2)
      const criptanCryptoValue = value(3)
      const urbanitaeRealEstateValue = value(4)
      const tradeRepublicInvestmentValue = value(5)
      const tradeRepublicCashBalance = value(6)
      const recalculatedNetWorth = caixaBalance
        + myInvestorValue
        + criptanCryptoValue
        + urbanitaeRealEstateValue
        + tradeRepublicInvestmentValue
        + tradeRepublicCashBalance
      const reportedNetWorth = value(12)
      const tradeRepublicEquityAdjustment = tradeRepublicEquityAdjustments.get(month)

      return {
        month,
        sourceDate: localIsoDate(selected.date),
        caixaBalance,
        tradeRepublicCashBalance,
        tradeRepublicInvestmentValue,
        myInvestorValue,
        criptanCryptoValue,
        urbanitaeRealEstateValue,
          reportedInterest: value(15),
          reportedBondPayments: value(16),
          reportedGeneratedCash: value(17),
          reportedGoldValue: value(28),
          reportedEquityValue: value(29),
          reportedEquityExGoldValue: value(30),
          reportedFixedIncomeValue: value(31),
          reportedCryptoValue: value(32),
          reportedRealEstateValue: value(33),
          tradeRepublicEquityAdjustmentValue: tradeRepublicEquityAdjustment?.value,
          tradeRepublicEquityAdjustmentUnrealizedProfit: tradeRepublicEquityAdjustment?.unrealizedProfit,
          tradeRepublicEquityAdjustmentPrincipal: tradeRepublicEquityAdjustment?.principal,
          recalculatedNetWorth,
        reportedNetWorth,
        difference: recalculatedNetWorth - reportedNetWorth,
        sourceRowsInMonth: monthRows.length,
      }
    })
    .sort((left, right) => left.month.localeCompare(right.month))

  return {
    sourceRowCount: parsedRows.length,
    selectedRowCount: rows.length,
    ignoredRowCount: parsedRows.length - rows.length,
    rows,
  }
}
