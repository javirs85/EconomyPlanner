import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = resolve(workspace, 'data', 'economy-planner.sqlite')
mkdirSync(dirname(databasePath), { recursive: true })

export const database = new DatabaseSync(databasePath)
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS raw_trade_republic_transactions (
    transaction_id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    datetime TEXT NOT NULL,
    type TEXT,
    payload_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tr_transactions_date
    ON raw_trade_republic_transactions(date);
  CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    file_name TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    min_transaction_date TEXT,
    max_transaction_date TEXT,
    coverage_start TEXT,
    coverage_end TEXT,
    summary_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS monthly_snapshots (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL UNIQUE,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    caixa_balance REAL NOT NULL,
    trade_republic_cash_balance REAL NOT NULL,
    trade_republic_equity_value REAL NOT NULL,
    trade_republic_fixed_income_value REAL NOT NULL,
    trade_republic_crypto_value REAL NOT NULL,
    my_investor_equity_value REAL NOT NULL,
    my_investor_fixed_income_value REAL NOT NULL,
    my_investor_crypto_value REAL NOT NULL,
    criptan_crypto_value REAL NOT NULL DEFAULT 0,
    my_investor_external_flow REAL NOT NULL,
    criptan_external_flow REAL NOT NULL DEFAULT 0,
    urbanitae_real_estate_value REAL NOT NULL DEFAULT 0,
    urbanitae_external_flow REAL NOT NULL DEFAULT 0,
    reported_interest REAL NOT NULL DEFAULT 0,
    reported_bond_payments REAL NOT NULL DEFAULT 0,
    reported_generated_cash REAL NOT NULL DEFAULT 0,
    trade_republic_equity_principal REAL,
    trade_republic_equity_unrealized_profit REAL,
    trade_republic_fixed_income_principal REAL,
    trade_republic_fixed_income_unrealized_profit REAL,
    trade_republic_crypto_principal REAL,
    trade_republic_crypto_unrealized_profit REAL,
    my_investor_equity_principal REAL,
    my_investor_equity_unrealized_profit REAL,
    my_investor_fixed_income_principal REAL,
    my_investor_fixed_income_unrealized_profit REAL,
    my_investor_crypto_principal REAL,
    my_investor_crypto_unrealized_profit REAL,
    criptan_crypto_principal REAL,
    criptan_crypto_unrealized_profit REAL,
    urbanitae_real_estate_principal REAL,
    urbanitae_real_estate_unrealized_profit REAL,
    snapshot_origin TEXT NOT NULL DEFAULT 'manual'
  );
`)

const importBatchColumns = new Set(
  database.prepare('PRAGMA table_info(import_batches)').all().map(({ name }) => name),
)
if (!importBatchColumns.has('coverage_start')) database.exec('ALTER TABLE import_batches ADD COLUMN coverage_start TEXT')
if (!importBatchColumns.has('coverage_end')) database.exec('ALTER TABLE import_batches ADD COLUMN coverage_end TEXT')
database.exec(`
  UPDATE import_batches
  SET
    coverage_start = COALESCE(coverage_start, min_transaction_date),
    coverage_end = COALESCE(coverage_end, max_transaction_date)
`)

const monthlySnapshotColumns = new Set(
  database.prepare('PRAGMA table_info(monthly_snapshots)').all().map(({ name }) => name),
)
if (!monthlySnapshotColumns.has('criptan_crypto_value')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN criptan_crypto_value REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('urbanitae_real_estate_value')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN urbanitae_real_estate_value REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('criptan_external_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN criptan_external_flow REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('urbanitae_external_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN urbanitae_external_flow REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('reported_interest')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN reported_interest REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('reported_bond_payments')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN reported_bond_payments REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('reported_generated_cash')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN reported_generated_cash REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('snapshot_origin')) {
  database.exec("ALTER TABLE monthly_snapshots ADD COLUMN snapshot_origin TEXT NOT NULL DEFAULT 'manual'")
}

const baselineColumns = [
  'trade_republic_equity_principal',
  'trade_republic_equity_unrealized_profit',
  'trade_republic_fixed_income_principal',
  'trade_republic_fixed_income_unrealized_profit',
  'trade_republic_crypto_principal',
  'trade_republic_crypto_unrealized_profit',
  'my_investor_equity_principal',
  'my_investor_equity_unrealized_profit',
  'my_investor_fixed_income_principal',
  'my_investor_fixed_income_unrealized_profit',
  'my_investor_crypto_principal',
  'my_investor_crypto_unrealized_profit',
  'criptan_crypto_principal',
  'criptan_crypto_unrealized_profit',
  'urbanitae_real_estate_principal',
  'urbanitae_real_estate_unrealized_profit',
]
for (const column of baselineColumns) {
  if (!monthlySnapshotColumns.has(column)) database.exec(`ALTER TABLE monthly_snapshots ADD COLUMN ${column} REAL`)
}

const baselineMonth = '2026-05'

database.exec(`
  UPDATE monthly_snapshots
  SET snapshot_origin = CASE
    WHEN month < '${baselineMonth}' THEN 'historical-visual'
    WHEN month = '${baselineMonth}' THEN 'baseline'
    ELSE 'tracked'
  END
  WHERE snapshot_origin IN ('historical-migration', 'manual', 'historical-visual', 'baseline', 'tracked')
`)

export function latestImportedTransactionDate() {
  return database.prepare(`
    SELECT MAX(date) AS latestTransactionDate
    FROM raw_trade_republic_transactions
  `).get()?.latestTransactionDate
}

export function importTransactions({ fileName, coverageStart, coverageEnd, transactions, summary }) {
  const existing = database.prepare(`
    SELECT 1 FROM raw_trade_republic_transactions WHERE transaction_id = ?
  `)
  const insert = database.prepare(`
    INSERT INTO raw_trade_republic_transactions (
      transaction_id, date, datetime, type, payload_json
    ) VALUES (?, ?, ?, ?, ?)
  `)

  database.exec('BEGIN')
  try {
    for (const transaction of transactions) {
      if (existing.get(transaction.transactionId)) {
        summary.duplicateCount += 1
      } else {
        insert.run(
          transaction.transactionId,
          transaction.date,
          transaction.datetime,
          transaction.type ?? null,
          JSON.stringify(transaction),
        )
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
    database.prepare(`
      INSERT INTO import_batches (
        id, source, file_name, imported_at, min_transaction_date,
        max_transaction_date, coverage_start, coverage_end, summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batch.id,
      batch.source,
      batch.fileName,
      batch.importedAt,
      batch.minTransactionDate ?? null,
      batch.maxTransactionDate ?? null,
      batch.coverageStart,
      batch.coverageEnd,
      JSON.stringify(batch.summary),
    )
    database.exec('COMMIT')
    return batch
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

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

export function exploreTransactions({ from, to, investmentsOnly, flow }) {
  const conditions = []
  const params = []
  if (from) {
    conditions.push('date >= ?')
    params.push(from)
  }
  if (to) {
    conditions.push('date <= ?')
    params.push(to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = database.prepare(`
    SELECT payload_json
    FROM raw_trade_republic_transactions
    ${where}
    ORDER BY datetime DESC
  `).all(...params)
  const allTransactions = rows.map(({ payload_json }) => JSON.parse(payload_json))
  const baseTransactions = investmentsOnly
    ? allTransactions.filter(({ type }) => investmentTypes.has(type))
    : allTransactions
  const transactions = flow
    ? baseTransactions.filter((transaction) => matchesFlowFilter(transaction, flow))
    : baseTransactions
  const metrics = classifyExplorerMetrics(baseTransactions)
  metrics.movementCount = transactions.length

  return {
    transactions,
    metrics,
  }
}

function calculateTradeRepublicExternalFlow(periodStart, periodEnd) {
  const { externalIncome, externalWithdrawals } = database.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN type IN ('CUSTOMER_INBOUND', 'TRANSFER_INBOUND', 'TRANSFER_INSTANT_INBOUND')
        THEN CAST(json_extract(payload_json, '$.amount') AS REAL)
        ELSE 0
      END), 0) AS externalIncome,
      COALESCE(SUM(CASE
        WHEN type IN ('CUSTOMER_OUTBOUND', 'TRANSFER_OUTBOUND', 'TRANSFER_INSTANT_OUTBOUND')
        THEN ABS(CAST(json_extract(payload_json, '$.amount') AS REAL))
        ELSE 0
      END), 0) AS externalWithdrawals
    FROM raw_trade_republic_transactions
    WHERE date >= ? AND date <= ?
  `).get(periodStart, periodEnd)

  return externalIncome - externalWithdrawals
}

function getCsvCoverage(periodStart, periodEnd) {
  const coverage = database.prepare(`
    SELECT
      MIN(coverage_start) AS coverageStart,
      MAX(coverage_end) AS coverageEnd
    FROM import_batches
    WHERE coverage_start IS NOT NULL AND coverage_end IS NOT NULL
  `).get()
  const coverageStart = coverage?.coverageStart
  const coverageEnd = coverage?.coverageEnd
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

function mapMonthlySnapshot(row) {
  if (!row) return undefined
  return {
    id: row.id,
    month: row.month,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    caixaBalance: row.caixa_balance,
    tradeRepublicCashBalance: row.trade_republic_cash_balance,
    tradeRepublicEquityValue: row.trade_republic_equity_value,
    tradeRepublicFixedIncomeValue: row.trade_republic_fixed_income_value,
    tradeRepublicCryptoValue: row.trade_republic_crypto_value,
    myInvestorEquityValue: row.my_investor_equity_value,
    myInvestorFixedIncomeValue: row.my_investor_fixed_income_value,
    myInvestorCryptoValue: row.my_investor_crypto_value,
    criptanCryptoValue: row.criptan_crypto_value,
    myInvestorExternalFlow: row.my_investor_external_flow,
    criptanExternalFlow: row.criptan_external_flow,
    urbanitaeRealEstateValue: row.urbanitae_real_estate_value,
    urbanitaeExternalFlow: row.urbanitae_external_flow,
    reportedInterest: row.reported_interest,
    reportedBondPayments: row.reported_bond_payments,
    reportedGeneratedCash: row.reported_generated_cash,
    tradeRepublicEquityPrincipal: row.trade_republic_equity_principal,
    tradeRepublicEquityUnrealizedProfit: row.trade_republic_equity_unrealized_profit,
    tradeRepublicFixedIncomePrincipal: row.trade_republic_fixed_income_principal,
    tradeRepublicFixedIncomeUnrealizedProfit: row.trade_republic_fixed_income_unrealized_profit,
    tradeRepublicCryptoPrincipal: row.trade_republic_crypto_principal,
    tradeRepublicCryptoUnrealizedProfit: row.trade_republic_crypto_unrealized_profit,
    myInvestorEquityPrincipal: row.my_investor_equity_principal,
    myInvestorEquityUnrealizedProfit: row.my_investor_equity_unrealized_profit,
    myInvestorFixedIncomePrincipal: row.my_investor_fixed_income_principal,
    myInvestorFixedIncomeUnrealizedProfit: row.my_investor_fixed_income_unrealized_profit,
    myInvestorCryptoPrincipal: row.my_investor_crypto_principal,
    myInvestorCryptoUnrealizedProfit: row.my_investor_crypto_unrealized_profit,
    criptanCryptoPrincipal: row.criptan_crypto_principal,
    criptanCryptoUnrealizedProfit: row.criptan_crypto_unrealized_profit,
    urbanitaeRealEstatePrincipal: row.urbanitae_real_estate_principal,
    urbanitaeRealEstateUnrealizedProfit: row.urbanitae_real_estate_unrealized_profit,
    snapshotOrigin: row.snapshot_origin,
  }
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

export function getMonthlyClosing({ month, periodStart, periodEnd }) {
  const snapshot = database.prepare(`
    SELECT * FROM monthly_snapshots WHERE month = ?
  `).get(month)

  return {
    snapshot: mapMonthlySnapshot(snapshot),
    tradeRepublicExternalFlow: calculateTradeRepublicExternalFlow(periodStart, periodEnd),
    csvCoverage: getCsvCoverage(periodStart, periodEnd),
  }
}

export function saveMonthlyClosing(snapshot) {
  const now = new Date().toISOString()
  const existing = database.prepare(`
    SELECT id, created_at FROM monthly_snapshots WHERE month = ?
  `).get(snapshot.month)
  const id = existing?.id ?? crypto.randomUUID()
  const createdAt = existing?.created_at ?? now

  database.prepare(`
    INSERT INTO monthly_snapshots (
      id, month, period_start, period_end, created_at, updated_at,
      caixa_balance, trade_republic_cash_balance,
      trade_republic_equity_value, trade_republic_fixed_income_value,
      trade_republic_crypto_value, my_investor_equity_value,
      my_investor_fixed_income_value, my_investor_crypto_value, criptan_crypto_value,
      my_investor_external_flow, criptan_external_flow, urbanitae_real_estate_value, urbanitae_external_flow,
      reported_interest, reported_bond_payments, reported_generated_cash, snapshot_origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(month) DO UPDATE SET
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      updated_at = excluded.updated_at,
      caixa_balance = excluded.caixa_balance,
      trade_republic_cash_balance = excluded.trade_republic_cash_balance,
      trade_republic_equity_value = excluded.trade_republic_equity_value,
      trade_republic_fixed_income_value = excluded.trade_republic_fixed_income_value,
      trade_republic_crypto_value = excluded.trade_republic_crypto_value,
      my_investor_equity_value = excluded.my_investor_equity_value,
      my_investor_fixed_income_value = excluded.my_investor_fixed_income_value,
      my_investor_crypto_value = excluded.my_investor_crypto_value,
      criptan_crypto_value = excluded.criptan_crypto_value,
      my_investor_external_flow = excluded.my_investor_external_flow,
      criptan_external_flow = excluded.criptan_external_flow,
      urbanitae_real_estate_value = excluded.urbanitae_real_estate_value,
      urbanitae_external_flow = excluded.urbanitae_external_flow,
      reported_interest = excluded.reported_interest,
      reported_bond_payments = excluded.reported_bond_payments,
      reported_generated_cash = excluded.reported_generated_cash,
      snapshot_origin = excluded.snapshot_origin
  `).run(
    id,
    snapshot.month,
    snapshot.periodStart,
    snapshot.periodEnd,
    createdAt,
    now,
    snapshot.caixaBalance,
    snapshot.tradeRepublicCashBalance,
    snapshot.tradeRepublicEquityValue,
    snapshot.tradeRepublicFixedIncomeValue,
    snapshot.tradeRepublicCryptoValue,
    snapshot.myInvestorEquityValue,
    snapshot.myInvestorFixedIncomeValue,
    snapshot.myInvestorCryptoValue,
    snapshot.criptanCryptoValue,
    snapshot.myInvestorExternalFlow,
    snapshot.criptanExternalFlow ?? 0,
    snapshot.urbanitaeRealEstateValue,
    snapshot.urbanitaeExternalFlow,
    snapshot.reportedInterest ?? 0,
    snapshot.reportedBondPayments ?? 0,
    snapshot.reportedGeneratedCash ?? 0,
    normalizeSnapshotOrigin(snapshot.snapshotOrigin, snapshot.month),
  )

  return getMonthlyClosing(snapshot)
}

export function importHistoricalSnapshots(snapshots) {
  const existingMonths = new Set(database.prepare('SELECT month FROM monthly_snapshots').all().map(({ month }) => month))
  const imported = []
  const skipped = []

  for (const snapshot of snapshots) {
    if (existingMonths.has(snapshot.month)) {
      skipped.push(snapshot.month)
      continue
    }
    saveMonthlyClosing(snapshot)
    imported.push(snapshot.month)
  }

  return { imported, skipped }
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

export function getYearClosingStatus(year) {
  const snapshots = new Set(
    database.prepare(`
      SELECT month FROM monthly_snapshots WHERE month >= ? AND month <= ?
    `).all(`${year}-01`, `${year}-12`).map(({ month }) => month),
  )

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const period = monthPeriod(year, monthIndex)
    return {
      ...period,
      snapshotSaved: snapshots.has(period.month),
      csvCoverage: getCsvCoverage(period.periodStart, period.periodEnd),
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

function calculateDetectedYields(periodStart, periodEnd) {
  const row = database.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN type IN ('INTEREST_PAYMENT', 'DIVIDEND', 'DIVIDEND_PAYMENT', 'BENEFITS_SAVEBACK', 'STOCKPERK')
      THEN CAST(json_extract(payload_json, '$.amount') AS REAL)
      ELSE 0
    END), 0) AS detectedYields
    FROM raw_trade_republic_transactions
    WHERE date >= ? AND date <= ?
  `).get(periodStart, periodEnd)
  return row.detectedYields
}

function calculateIncomeBreakdown(snapshot) {
  const coverage = getCsvCoverage(snapshot.periodStart, snapshot.periodEnd)
  if (coverage.status !== 'missing') {
    const row = database.prepare(`
      SELECT
        COALESCE(SUM(CASE
          WHEN type = 'INTEREST_PAYMENT'
          THEN MAX(0, CAST(json_extract(payload_json, '$.amount') AS REAL))
          ELSE 0
        END), 0) AS interestPayments,
        COALESCE(SUM(CASE
          WHEN type IN ('DIVIDEND', 'DIVIDEND_PAYMENT')
          THEN MAX(0, CAST(json_extract(payload_json, '$.amount') AS REAL))
          ELSE 0
        END), 0) AS dividendPayments,
        COALESCE(SUM(CASE
          WHEN type IN ('BENEFITS_SAVEBACK', 'STOCKPERK')
          THEN MAX(0, CAST(json_extract(payload_json, '$.amount') AS REAL))
          ELSE 0
        END), 0) AS benefitPayments,
        COALESCE(SUM(CASE
          WHEN type = 'FINAL_MATURITY'
          THEN MAX(0, CAST(json_extract(payload_json, '$.amount') AS REAL))
          ELSE 0
        END), 0) AS bondMaturities
      FROM raw_trade_republic_transactions
      WHERE date >= ? AND date <= ?
    `).get(snapshot.periodStart, snapshot.periodEnd)

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

function calculateTradeRepublicInvestmentFlow(periodStart, periodEnd) {
  const row = database.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN type = 'BUY' THEN ABS(CAST(json_extract(payload_json, '$.amount') AS REAL))
      WHEN type IN ('SELL', 'FINAL_MATURITY') THEN -ABS(CAST(json_extract(payload_json, '$.amount') AS REAL))
      ELSE 0
    END), 0) AS investmentFlow
    FROM raw_trade_republic_transactions
    WHERE date >= ? AND date <= ?
  `).get(periodStart, periodEnd)
  return row.investmentFlow
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

function attributeLiquidInvestments(snapshots) {
  let previous

  return snapshots.map((snapshot) => {
    const value = liquidInvestmentValue(snapshot)
    if (!previous || snapshot.snapshotOrigin === 'historical-migration') {
      const attributed = { principal: value * 0.9, growth: value * 0.1, value }
      previous = attributed
      return attributed
    }

    const flow = calculateTradeRepublicInvestmentFlow(snapshot.periodStart, snapshot.periodEnd)
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

export function getDashboard() {
  const snapshots = database.prepare(`
    SELECT * FROM monthly_snapshots ORDER BY month ASC
  `).all().map(mapMonthlySnapshot)

  if (snapshots.length === 0) return { snapshots: [], summary: undefined }

  const latest = snapshots.at(-1)
  const previous = snapshots.at(-2)
  const currentNetWorth = snapshotNetWorth(latest)
  const previousNetWorth = previous ? snapshotNetWorth(previous) : undefined
  const monthlyChange = previousNetWorth === undefined ? undefined : currentNetWorth - previousNetWorth
  const tradeRepublicExternalFlow = calculateTradeRepublicExternalFlow(latest.periodStart, latest.periodEnd)
  const netContribution = tradeRepublicExternalFlow + latest.myInvestorExternalFlow + latest.urbanitaeExternalFlow
  const detectedYields = calculateDetectedYields(latest.periodStart, latest.periodEnd)

  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const investmentAttribution = attributeLiquidInvestments(snapshots)
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
      incomeBreakdown: calculateIncomeBreakdown(snapshot),
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
