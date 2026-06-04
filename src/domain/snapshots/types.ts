export interface MonthlyOriginStack {
  month: string
  snapshotOrigin: 'historical-visual' | 'baseline' | 'tracked'
  periodStart: string
  periodEnd: string
  label: string
  cashFromSalary: number
  cashFromYields: number
  fixedIncome: number
  investedPrincipal: number
  investedGrowth: number
  realEstatePrincipal: number
  totalNetWorth: number
  monthlyChange?: number
  monthlyChangePercent?: number
  marketGrowth?: number
  marketChange?: number
  passiveIncome: number
  passiveIncomeYtd: number
  assetBreakdown: AssetBreakdownItem[]
  incomeBreakdown: IncomeBreakdown
  savingsBreakdown: SavingsBreakdown
}

export interface AssetAllocation {
  label: string
  value: number
  color: string
}

export interface AssetBreakdownItem {
  key: string
  category: 'cash' | 'equity' | 'fixedIncome' | 'crypto' | 'realEstate'
  label: string
  value: number
  principal?: number
  growth?: number
  unrealizedProfit?: number
}

export interface IncomeBreakdownItem {
  key: string
  label: string
  value: number
}

export interface IncomeBreakdown {
  source: 'csv' | 'manual'
  coverageStatus: 'missing' | 'partial' | 'complete'
  items: IncomeBreakdownItem[]
  total: number
}

export interface SavingsBreakdown {
  myInvestor: number
  myInvestorEquity: number
  myInvestorFixedIncome: number
  myInvestorCrypto: number
  criptan: number
  urbanitae: number
  total: number
}
