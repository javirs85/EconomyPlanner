export interface RawTradeRepublicTransaction {
  transactionId: string
  datetime: string
  date: string
  accountType?: string
  category?: string
  type?: string
  assetClass?: string
  name?: string
  symbol?: string
  shares?: number
  price?: number
  amount?: number
  fee?: number
  tax?: number
  currency?: string
  originalAmount?: number
  originalCurrency?: string
  fxRate?: number
  description?: string
  counterpartyName?: string
  counterpartyIban?: string
  paymentReference?: string
  mccCode?: string
  raw: Record<string, string>
}

export interface TradeRepublicImportSummary {
  rowCount: number
  insertedCount: number
  duplicateCount: number
  unknownCount: number
  interest: number
  dividends: number
  bondMaturities: number
  benefits: number
  buys: number
  sells: number
  externalContributions: number
  externalWithdrawals: number
  cardExpenses: number
  taxes: number
}

export interface ImportBatch {
  id: string
  source: 'TradeRepublic'
  fileName: string
  importedAt: string
  minTransactionDate?: string
  maxTransactionDate?: string
  coverageStart: string
  coverageEnd: string
  summary: TradeRepublicImportSummary
}

export interface TransactionExplorerMetrics {
  movementCount: number
  externalIncome: number
  cardExpenses: number
  invested: number
  investmentSales: number
  investmentIncome: number
  bondMaturities: number
  netCashFlow: number
}

export interface TransactionExplorerResult {
  transactions: RawTradeRepublicTransaction[]
  metrics: TransactionExplorerMetrics
}
