import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  baselineMonth,
  calculateDashboard,
  classifyTradeRepublicTransactions,
  myInvestorExternalFlow,
  netAmount,
  normalizeSnapshotOrigin,
  resolveSnapshotPrincipals,
} from '../shared/economyDomain.js'

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
    my_investor_equity_external_flow REAL NOT NULL DEFAULT 0,
    my_investor_fixed_income_external_flow REAL NOT NULL DEFAULT 0,
    my_investor_crypto_external_flow REAL NOT NULL DEFAULT 0,
    criptan_external_flow REAL NOT NULL DEFAULT 0,
    urbanitae_real_estate_value REAL NOT NULL DEFAULT 0,
    urbanitae_external_flow REAL NOT NULL DEFAULT 0,
    reported_interest REAL NOT NULL DEFAULT 0,
    reported_bond_payments REAL NOT NULL DEFAULT 0,
    reported_generated_cash REAL NOT NULL DEFAULT 0,
    schema_version INTEGER NOT NULL DEFAULT 2,
    generated_cash REAL NOT NULL DEFAULT 0,
    trade_republic_cash_contribution REAL NOT NULL DEFAULT 0,
    trade_republic_equity_flow REAL NOT NULL DEFAULT 0,
    trade_republic_fixed_income_flow REAL NOT NULL DEFAULT 0,
    trade_republic_crypto_flow REAL NOT NULL DEFAULT 0,
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
if (!monthlySnapshotColumns.has('my_investor_equity_external_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN my_investor_equity_external_flow REAL NOT NULL DEFAULT 0')
  database.exec('UPDATE monthly_snapshots SET my_investor_equity_external_flow = my_investor_external_flow')
}
if (!monthlySnapshotColumns.has('my_investor_fixed_income_external_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN my_investor_fixed_income_external_flow REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('my_investor_crypto_external_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN my_investor_crypto_external_flow REAL NOT NULL DEFAULT 0')
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
if (!monthlySnapshotColumns.has('schema_version')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 2')
}
if (!monthlySnapshotColumns.has('generated_cash')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN generated_cash REAL NOT NULL DEFAULT 0')
  database.exec('UPDATE monthly_snapshots SET generated_cash = reported_generated_cash')
}
if (!monthlySnapshotColumns.has('trade_republic_cash_contribution')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN trade_republic_cash_contribution REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('trade_republic_equity_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN trade_republic_equity_flow REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('trade_republic_fixed_income_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN trade_republic_fixed_income_flow REAL NOT NULL DEFAULT 0')
}
if (!monthlySnapshotColumns.has('trade_republic_crypto_flow')) {
  database.exec('ALTER TABLE monthly_snapshots ADD COLUMN trade_republic_crypto_flow REAL NOT NULL DEFAULT 0')
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

function getTradeRepublicTransactions(periodStart, periodEnd) {
  const rows = database.prepare(`
    SELECT payload_json
    FROM raw_trade_republic_transactions
    WHERE date >= ? AND date <= ?
    ORDER BY datetime ASC
  `).all(periodStart, periodEnd)
  return rows.map(({ payload_json }) => JSON.parse(payload_json))
}

function calculateTradeRepublicFacts(periodStart, periodEnd) {
  return classifyTradeRepublicTransactions(getTradeRepublicTransactions(periodStart, periodEnd), periodStart, periodEnd)
}

function getPreviousMonthlySnapshot(month) {
  const row = database.prepare(`
    SELECT * FROM monthly_snapshots
    WHERE month < ?
    ORDER BY month DESC
    LIMIT 1
  `).get(month)
  return mapMonthlySnapshot(row)
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
    schemaVersion: row.schema_version ?? 2,
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
    myInvestorEquityExternalFlow: row.my_investor_equity_external_flow ?? row.my_investor_external_flow,
    myInvestorFixedIncomeExternalFlow: row.my_investor_fixed_income_external_flow ?? 0,
    myInvestorCryptoExternalFlow: row.my_investor_crypto_external_flow ?? 0,
    criptanExternalFlow: row.criptan_external_flow,
    urbanitaeRealEstateValue: row.urbanitae_real_estate_value,
    urbanitaeExternalFlow: row.urbanitae_external_flow,
    reportedInterest: row.reported_interest,
    reportedBondPayments: row.reported_bond_payments,
    reportedGeneratedCash: row.generated_cash ?? row.reported_generated_cash,
    generatedCash: row.generated_cash ?? row.reported_generated_cash,
    tradeRepublicCashContribution: row.trade_republic_cash_contribution ?? 0,
    tradeRepublicEquityFlow: row.trade_republic_equity_flow ?? 0,
    tradeRepublicFixedIncomeFlow: row.trade_republic_fixed_income_flow ?? 0,
    tradeRepublicCryptoFlow: row.trade_republic_crypto_flow ?? 0,
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

export function getMonthlyClosing({ month, periodStart, periodEnd }) {
  const snapshot = database.prepare(`
    SELECT * FROM monthly_snapshots WHERE month = ?
  `).get(month)
  const tradeRepublicFacts = calculateTradeRepublicFacts(periodStart, periodEnd)

  return {
    snapshot: mapMonthlySnapshot(snapshot),
    previousSnapshot: getPreviousMonthlySnapshot(month),
    tradeRepublicExternalFlow: tradeRepublicFacts.tradeRepublicCashContribution,
    tradeRepublicFacts,
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
  const tradeRepublicFacts = calculateTradeRepublicFacts(snapshot.periodStart, snapshot.periodEnd)
  const historicalSnapshot = snapshot.snapshotOrigin === 'historical-migration' || snapshot.snapshotOrigin === 'historical-visual'
  const generatedCash = historicalSnapshot ? snapshot.generatedCash ?? snapshot.reportedGeneratedCash ?? 0 : tradeRepublicFacts.generatedCash
  const principals = resolveSnapshotPrincipals(snapshot, getPreviousMonthlySnapshot(snapshot.month), tradeRepublicFacts)
  const tradeRepublicEquityPrincipal = principals.tradeRepublicEquityPrincipal
  const tradeRepublicFixedIncomePrincipal = principals.tradeRepublicFixedIncomePrincipal
  const tradeRepublicCryptoPrincipal = principals.tradeRepublicCryptoPrincipal
  const myInvestorEquityPrincipal = principals.myInvestorEquityPrincipal
  const myInvestorFixedIncomePrincipal = principals.myInvestorFixedIncomePrincipal
  const myInvestorCryptoPrincipal = principals.myInvestorCryptoPrincipal
  const urbanitaeRealEstatePrincipal = principals.urbanitaeRealEstatePrincipal

  database.prepare(`
    INSERT INTO monthly_snapshots (
      id, month, period_start, period_end, created_at, updated_at,
      caixa_balance, trade_republic_cash_balance,
      trade_republic_equity_value, trade_republic_fixed_income_value,
      trade_republic_crypto_value, my_investor_equity_value,
      my_investor_fixed_income_value, my_investor_crypto_value, criptan_crypto_value,
      my_investor_external_flow, my_investor_equity_external_flow, my_investor_fixed_income_external_flow,
      my_investor_crypto_external_flow, criptan_external_flow, urbanitae_real_estate_value, urbanitae_external_flow,
      reported_interest, reported_bond_payments, reported_generated_cash, snapshot_origin,
      schema_version, generated_cash, trade_republic_cash_contribution, trade_republic_equity_flow,
      trade_republic_fixed_income_flow, trade_republic_crypto_flow,
      trade_republic_equity_principal, trade_republic_equity_unrealized_profit,
      trade_republic_fixed_income_principal, trade_republic_fixed_income_unrealized_profit,
      trade_republic_crypto_principal, trade_republic_crypto_unrealized_profit,
      my_investor_equity_principal, my_investor_equity_unrealized_profit,
      my_investor_fixed_income_principal, my_investor_fixed_income_unrealized_profit,
      my_investor_crypto_principal, my_investor_crypto_unrealized_profit,
      criptan_crypto_principal, criptan_crypto_unrealized_profit,
      urbanitae_real_estate_principal, urbanitae_real_estate_unrealized_profit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      my_investor_equity_external_flow = excluded.my_investor_equity_external_flow,
      my_investor_fixed_income_external_flow = excluded.my_investor_fixed_income_external_flow,
      my_investor_crypto_external_flow = excluded.my_investor_crypto_external_flow,
      criptan_external_flow = excluded.criptan_external_flow,
      urbanitae_real_estate_value = excluded.urbanitae_real_estate_value,
      urbanitae_external_flow = excluded.urbanitae_external_flow,
      reported_interest = excluded.reported_interest,
      reported_bond_payments = excluded.reported_bond_payments,
      reported_generated_cash = excluded.reported_generated_cash,
      snapshot_origin = excluded.snapshot_origin,
      schema_version = excluded.schema_version,
      generated_cash = excluded.generated_cash,
      trade_republic_cash_contribution = excluded.trade_republic_cash_contribution,
      trade_republic_equity_flow = excluded.trade_republic_equity_flow,
      trade_republic_fixed_income_flow = excluded.trade_republic_fixed_income_flow,
      trade_republic_crypto_flow = excluded.trade_republic_crypto_flow,
      trade_republic_equity_principal = excluded.trade_republic_equity_principal,
      trade_republic_equity_unrealized_profit = excluded.trade_republic_equity_unrealized_profit,
      trade_republic_fixed_income_principal = excluded.trade_republic_fixed_income_principal,
      trade_republic_fixed_income_unrealized_profit = excluded.trade_republic_fixed_income_unrealized_profit,
      trade_republic_crypto_principal = excluded.trade_republic_crypto_principal,
      trade_republic_crypto_unrealized_profit = excluded.trade_republic_crypto_unrealized_profit,
      my_investor_equity_principal = excluded.my_investor_equity_principal,
      my_investor_equity_unrealized_profit = excluded.my_investor_equity_unrealized_profit,
      my_investor_fixed_income_principal = excluded.my_investor_fixed_income_principal,
      my_investor_fixed_income_unrealized_profit = excluded.my_investor_fixed_income_unrealized_profit,
      my_investor_crypto_principal = excluded.my_investor_crypto_principal,
      my_investor_crypto_unrealized_profit = excluded.my_investor_crypto_unrealized_profit,
      criptan_crypto_principal = excluded.criptan_crypto_principal,
      criptan_crypto_unrealized_profit = excluded.criptan_crypto_unrealized_profit,
      urbanitae_real_estate_principal = excluded.urbanitae_real_estate_principal,
      urbanitae_real_estate_unrealized_profit = excluded.urbanitae_real_estate_unrealized_profit
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
    myInvestorExternalFlow(snapshot),
    snapshot.myInvestorEquityExternalFlow ?? snapshot.myInvestorExternalFlow ?? 0,
    snapshot.myInvestorFixedIncomeExternalFlow ?? 0,
    snapshot.myInvestorCryptoExternalFlow ?? 0,
    snapshot.criptanExternalFlow ?? 0,
    snapshot.urbanitaeRealEstateValue,
    snapshot.urbanitaeExternalFlow,
    historicalSnapshot ? snapshot.reportedInterest ?? 0 : 0,
    historicalSnapshot ? snapshot.reportedBondPayments ?? 0 : 0,
    historicalSnapshot ? snapshot.reportedGeneratedCash ?? generatedCash : generatedCash,
    normalizeSnapshotOrigin(snapshot.snapshotOrigin, snapshot.month),
    2,
    generatedCash,
    tradeRepublicFacts.tradeRepublicCashContribution,
    tradeRepublicFacts.tradeRepublicEquityFlow,
    tradeRepublicFacts.tradeRepublicFixedIncomeFlow,
    tradeRepublicFacts.tradeRepublicCryptoFlow,
    tradeRepublicEquityPrincipal,
    snapshot.tradeRepublicEquityUnrealizedProfit ?? snapshot.tradeRepublicEquityValue - tradeRepublicEquityPrincipal,
    tradeRepublicFixedIncomePrincipal,
    snapshot.tradeRepublicFixedIncomeUnrealizedProfit ?? snapshot.tradeRepublicFixedIncomeValue - tradeRepublicFixedIncomePrincipal,
    tradeRepublicCryptoPrincipal,
    snapshot.tradeRepublicCryptoUnrealizedProfit ?? snapshot.tradeRepublicCryptoValue - tradeRepublicCryptoPrincipal,
    myInvestorEquityPrincipal,
    snapshot.myInvestorEquityUnrealizedProfit ?? snapshot.myInvestorEquityValue - myInvestorEquityPrincipal,
    myInvestorFixedIncomePrincipal,
    snapshot.myInvestorFixedIncomeUnrealizedProfit ?? snapshot.myInvestorFixedIncomeValue - myInvestorFixedIncomePrincipal,
    myInvestorCryptoPrincipal,
    snapshot.myInvestorCryptoUnrealizedProfit ?? snapshot.myInvestorCryptoValue - myInvestorCryptoPrincipal,
    snapshot.criptanCryptoValue,
    0,
    urbanitaeRealEstatePrincipal,
    snapshot.urbanitaeRealEstateUnrealizedProfit ?? snapshot.urbanitaeRealEstateValue - urbanitaeRealEstatePrincipal,
  )

  return getMonthlyClosing(snapshot)
}

export function importHistoricalSnapshots(snapshots) {
  const existingMonths = new Map(database.prepare('SELECT month, snapshot_origin FROM monthly_snapshots').all().map(({ month, snapshot_origin }) => [month, snapshot_origin]))
  const imported = []
  const updated = []
  const skipped = []

  for (const snapshot of snapshots) {
    const existingOrigin = existingMonths.get(snapshot.month)
    if (existingOrigin && existingOrigin !== 'historical-visual' && existingOrigin !== 'historical-migration') {
      skipped.push(snapshot.month)
      continue
    }
    saveMonthlyClosing(snapshot)
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

export function applyHistoricalTradeRepublicEquityAdjustments(adjustments) {
  const updated = []
  const missing = []
  const skipped = []

  for (const [month, adjustment] of adjustments) {
    const snapshot = mapMonthlySnapshot(database.prepare('SELECT * FROM monthly_snapshots WHERE month = ?').get(month))
    if (!snapshot) {
      missing.push(month)
      continue
    }
    if (snapshot.snapshotOrigin !== 'historical-visual' && snapshot.snapshotOrigin !== 'historical-migration') {
      skipped.push(month)
      continue
    }
    saveMonthlyClosing(applyTradeRepublicEquityAdjustment(snapshot, adjustment))
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

export function getDashboard() {
  const snapshots = database.prepare(`
    SELECT * FROM monthly_snapshots ORDER BY month ASC
  `).all().map(mapMonthlySnapshot)
  const transactions = database.prepare(`
    SELECT payload_json
    FROM raw_trade_republic_transactions
    ORDER BY datetime ASC
  `).all().map(({ payload_json }) => JSON.parse(payload_json))
  return calculateDashboard(snapshots, { transactions })
}
