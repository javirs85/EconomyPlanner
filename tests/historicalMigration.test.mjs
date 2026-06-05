import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyHistoricalTradeRepublicEquityAdjustments } from '../functions/_economyData.js'
import { parseHistoricalSnapshots, parseTradeRepublicEquityAdjustments } from '../server/historicalMigration.js'

function historicalLine({ date, tradeRepublicInvestmentValue, reportedNetWorth }) {
  const cells = Array.from({ length: 34 }, () => '')
  cells[0] = date
  cells[5] = String(tradeRepublicInvestmentValue)
  cells[12] = String(reportedNetWorth)
  cells[24] = '25%'
  cells[25] = '50%'
  cells[26] = '25%'
  return cells.join('\t')
}

test('parses TR RV historical adjustments from csv text', () => {
  const adjustments = parseTradeRepublicEquityAdjustments([
    'month,trRvValue,trRvUnrealizedProfit',
    '2025-07,15526.49,492.93',
  ].join('\n'))

  assert.deepEqual(adjustments.get('2025-07'), {
    tradeRepublicEquityValue: 15526.49,
    tradeRepublicEquityUnrealizedProfit: 492.93,
    tradeRepublicEquityPrincipal: 15033.56,
  })
})

test('applies TR RV historical adjustment without changing total TR investment', () => {
  const text = [
    'Date\tCaixa\tMyInvestor\tCriptan\tUrbanitae\tTR Investment\tTR Cash',
    historicalLine({
      date: '31/07/2025',
      tradeRepublicInvestmentValue: 2000,
      reportedNetWorth: 2000,
    }),
  ].join('\n')
  const adjustmentText = [
    'month,trRvValue,trRvUnrealizedProfit',
    '2025-07,1200,200',
  ].join('\n')

  const [snapshot] = parseHistoricalSnapshots(text, adjustmentText)

  assert.equal(snapshot.tradeRepublicEquityValue, 1200)
  assert.equal(snapshot.tradeRepublicEquityPrincipal, 1000)
  assert.equal(snapshot.tradeRepublicEquityUnrealizedProfit, 200)
  assert.equal(snapshot.tradeRepublicFixedIncomeValue, 400)
  assert.equal(snapshot.tradeRepublicCryptoValue, 400)
  assert.equal(
    snapshot.tradeRepublicEquityValue + snapshot.tradeRepublicFixedIncomeValue + snapshot.tradeRepublicCryptoValue,
    2000,
  )
})

test('applies TR RV adjustments directly to existing historical snapshots only', () => {
  const data = {
    transactions: [],
    importBatches: [],
    monthlySnapshots: [
      {
        month: '2025-07',
        periodStart: '2025-07-04',
        periodEnd: '2025-08-03',
        caixaBalance: 0,
        tradeRepublicCashBalance: 0,
        tradeRepublicEquityValue: 1000,
        tradeRepublicFixedIncomeValue: 500,
        tradeRepublicCryptoValue: 500,
        myInvestorEquityValue: 0,
        myInvestorFixedIncomeValue: 0,
        myInvestorCryptoValue: 0,
        criptanCryptoValue: 0,
        urbanitaeRealEstateValue: 0,
        myInvestorExternalFlow: 0,
        urbanitaeExternalFlow: 0,
        generatedCash: 12,
        reportedGeneratedCash: 12,
        reportedInterest: 10,
        reportedBondPayments: 2,
        snapshotOrigin: 'historical-visual',
      },
      {
        month: '2026-05',
        periodStart: '2026-05-04',
        periodEnd: '2026-06-03',
        tradeRepublicEquityValue: 1000,
        tradeRepublicFixedIncomeValue: 0,
        tradeRepublicCryptoValue: 0,
        snapshotOrigin: 'baseline',
      },
    ],
  }
  const adjustments = parseTradeRepublicEquityAdjustments([
    'month,trRvValue,trRvUnrealizedProfit,trRvPrincipal',
    '2025-07,1200,200,1000',
    '2026-05,1100,100,1000',
    '2025-08,1300,300,1000',
  ].join('\n'))

  const result = applyHistoricalTradeRepublicEquityAdjustments(data, adjustments)
  const updatedSnapshot = data.monthlySnapshots.find((snapshot) => snapshot.month === '2025-07')

  assert.deepEqual(result, {
    updated: ['2025-07'],
    missing: ['2025-08'],
    skipped: ['2026-05'],
  })
  assert.equal(updatedSnapshot.tradeRepublicEquityValue, 1200)
  assert.equal(updatedSnapshot.tradeRepublicEquityPrincipal, 1000)
  assert.equal(updatedSnapshot.tradeRepublicEquityUnrealizedProfit, 200)
  assert.equal(updatedSnapshot.tradeRepublicFixedIncomeValue, 400)
  assert.equal(updatedSnapshot.tradeRepublicCryptoValue, 400)
  assert.equal(updatedSnapshot.reportedGeneratedCash, 12)
  assert.equal(updatedSnapshot.generatedCash, 12)
})
