export interface MonthlySnapshot {
  id?: string
  month: string
  periodStart: string
  periodEnd: string
  createdAt?: string
  updatedAt?: string
  caixaBalance: number
  tradeRepublicCashBalance: number
  tradeRepublicEquityValue: number
  tradeRepublicFixedIncomeValue: number
  tradeRepublicCryptoValue: number
  myInvestorEquityValue: number
  myInvestorFixedIncomeValue: number
  myInvestorCryptoValue: number
  criptanCryptoValue: number
  myInvestorExternalFlow?: number
  myInvestorEquityExternalFlow: number
  myInvestorFixedIncomeExternalFlow: number
  myInvestorCryptoExternalFlow: number
  criptanExternalFlow: number
  urbanitaeRealEstateValue: number
  urbanitaeExternalFlow: number
}

export interface MonthlyClosingStatus {
  snapshot?: MonthlySnapshot
  tradeRepublicExternalFlow: number
  csvCoverage: CsvCoverage
}

export interface CsvCoverage {
  status: 'complete' | 'partial' | 'missing'
  coverageStart?: string
  coverageEnd?: string
}

export interface MonthlyClosingMonthStatus {
  month: string
  periodStart: string
  periodEnd: string
  snapshotSaved: boolean
  csvCoverage: CsvCoverage
}

export async function getYearClosingStatus(year: number) {
  const response = await fetch(`/api/monthly-closing/year?year=${year}`)
  if (!response.ok) throw new Error('No se pudo consultar el calendario de cierres.')
  return await response.json() as MonthlyClosingMonthStatus[]
}

export async function getMonthlyClosing(month: string, periodStart: string, periodEnd: string) {
  const query = new URLSearchParams({ month, periodStart, periodEnd })
  const response = await fetch(`/api/monthly-closing?${query}`)
  if (!response.ok) throw new Error('No se pudo consultar el cierre mensual.')
  return await response.json() as MonthlyClosingStatus
}

export async function saveMonthlyClosing(snapshot: MonthlySnapshot) {
  const response = await fetch('/api/monthly-closing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
  const result = await response.json() as MonthlyClosingStatus | { error: string }
  if (!response.ok || 'error' in result) {
    throw new Error('error' in result ? result.error : 'No se pudo guardar el cierre mensual.')
  }
  return result
}
