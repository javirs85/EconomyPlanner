import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saveMonthlyClosing } from '../functions/_economyData.js'

test('monthly closing can override a detected Trade Republic inbound transfer', () => {
  const data = {
    schemaVersion: 2,
    importBatches: [],
    transactions: [{
      transactionId: 'own-account-transfer',
      datetime: '2026-10-04T08:00:00.000Z',
      date: '2026-10-04',
      type: 'TRANSFER_INSTANT_INBOUND',
      amount: 4000,
    }],
    monthlySnapshots: [{
      month: '2026-09',
      periodStart: '2026-09-04',
      periodEnd: '2026-10-03',
      snapshotOrigin: 'tracked',
      caixaBalance: 10000,
      tradeRepublicCashBalance: 6000,
      tradeRepublicEquityValue: 17000,
      tradeRepublicEquityPrincipal: 13000,
      tradeRepublicFixedIncomeValue: 5800,
      tradeRepublicFixedIncomePrincipal: 6000,
      tradeRepublicCryptoValue: 2900,
      tradeRepublicCryptoPrincipal: 3700,
      myInvestorEquityValue: 27000,
      myInvestorEquityPrincipal: 25000,
      myInvestorFixedIncomeValue: 0,
      myInvestorFixedIncomePrincipal: 0,
      myInvestorCryptoValue: 2600,
      myInvestorCryptoPrincipal: 2400,
      criptanCryptoValue: 1000,
      urbanitaeRealEstateValue: 2000,
      urbanitaeRealEstatePrincipal: 2000,
    }],
  }

  const result = saveMonthlyClosing(data, {
    month: '2026-10',
    periodStart: '2026-10-04',
    periodEnd: '2026-11-03',
    snapshotOrigin: 'tracked',
    caixaBalance: 9000,
    tradeRepublicCashBalance: 9000,
    tradeRepublicCashContribution: 0,
    tradeRepublicEquityValue: 17000,
    tradeRepublicFixedIncomeValue: 5800,
    tradeRepublicCryptoValue: 2800,
    myInvestorEquityValue: 27000,
    myInvestorFixedIncomeValue: 0,
    myInvestorCryptoValue: 2500,
    criptanCryptoValue: 1000,
    myInvestorEquityExternalFlow: 0,
    myInvestorFixedIncomeExternalFlow: 0,
    myInvestorCryptoExternalFlow: 0,
    criptanExternalFlow: 0,
    urbanitaeRealEstateValue: 2000,
    urbanitaeExternalFlow: 0,
  })

  assert.equal(result.tradeRepublicFacts.tradeRepublicCashContribution, 4000)
  assert.equal(result.snapshot.tradeRepublicCashContribution, 0)
  assert.equal(data.monthlySnapshots.at(-1).tradeRepublicCashContribution, 0)
})
