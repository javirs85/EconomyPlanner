import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const inputPath = resolve(process.argv[2] ?? 'data/economy-planner.sqlite')
const outputPath = resolve(process.argv[3] ?? 'data/economy-planner-r2.json')

const database = new DatabaseSync(inputPath, { readOnly: true })

function readTransactions() {
  return database.prepare(`
    SELECT payload_json
    FROM raw_trade_republic_transactions
    ORDER BY datetime ASC
  `).all().map(({ payload_json }) => JSON.parse(payload_json))
}

function readImportBatches() {
  return database.prepare(`
    SELECT *
    FROM import_batches
    ORDER BY imported_at ASC
  `).all().map((row) => ({
    id: row.id,
    source: row.source,
    fileName: row.file_name,
    importedAt: row.imported_at,
    minTransactionDate: row.min_transaction_date,
    maxTransactionDate: row.max_transaction_date,
    coverageStart: row.coverage_start ?? row.min_transaction_date,
    coverageEnd: row.coverage_end ?? row.max_transaction_date,
    summary: JSON.parse(row.summary_json),
  }))
}

function readMonthlySnapshots() {
  return database.prepare(`
    SELECT *
    FROM monthly_snapshots
    ORDER BY month ASC
  `).all().map((row) => ({
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
    criptanCryptoValue: row.criptan_crypto_value ?? 0,
    myInvestorExternalFlow: row.my_investor_external_flow,
    myInvestorEquityExternalFlow: row.my_investor_equity_external_flow ?? row.my_investor_external_flow,
    myInvestorFixedIncomeExternalFlow: row.my_investor_fixed_income_external_flow ?? 0,
    myInvestorCryptoExternalFlow: row.my_investor_crypto_external_flow ?? 0,
    criptanExternalFlow: row.criptan_external_flow ?? 0,
    urbanitaeRealEstateValue: row.urbanitae_real_estate_value ?? 0,
    urbanitaeExternalFlow: row.urbanitae_external_flow ?? 0,
    reportedInterest: row.reported_interest ?? 0,
    reportedBondPayments: row.reported_bond_payments ?? 0,
    reportedGeneratedCash: row.reported_generated_cash ?? 0,
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
  }))
}

const data = {
  schemaVersion: 1,
  transactions: readTransactions(),
  importBatches: readImportBatches(),
  monthlySnapshots: readMonthlySnapshots(),
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({
  outputPath,
  transactions: data.transactions.length,
  importBatches: data.importBatches.length,
  monthlySnapshots: data.monthlySnapshots.length,
}, null, 2))
