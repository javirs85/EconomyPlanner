import assert from 'node:assert/strict'
import { test } from 'node:test'
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
