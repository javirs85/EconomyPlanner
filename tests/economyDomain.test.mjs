import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateDashboard, classifyTradeRepublicTransactions, netAmount, resolveSnapshotPrincipals } from '../shared/economyDomain.js'

test('netAmount uses amount plus tax and fee as the accounting amount', () => {
  assert.equal(netAmount({ amount: 15, tax: -2.85, fee: -0.15 }), 12)
})

test('resolves baseline principals from inputs and tracked principals from previous snapshot plus flows', () => {
  assert.deepEqual(resolveSnapshotPrincipals({
    month: '2026-05',
    tradeRepublicEquityValue: 100,
    tradeRepublicEquityPrincipal: 80,
    tradeRepublicCryptoValue: 30,
    myInvestorEquityValue: 40,
    myInvestorCryptoValue: 50,
    urbanitaeRealEstateValue: 60,
  }, undefined), {
    tradeRepublicEquityPrincipal: 80,
    tradeRepublicCryptoPrincipal: 30,
    myInvestorEquityPrincipal: 40,
    myInvestorCryptoPrincipal: 50,
    urbanitaeRealEstatePrincipal: 60,
  })

  assert.deepEqual(resolveSnapshotPrincipals({
    month: '2026-06',
    myInvestorEquityExternalFlow: 10,
    myInvestorCryptoExternalFlow: -5,
    urbanitaeExternalFlow: 20,
  }, {
    tradeRepublicEquityPrincipal: 100,
    tradeRepublicCryptoPrincipal: 200,
    myInvestorEquityPrincipal: 300,
    myInvestorCryptoPrincipal: 400,
    urbanitaeRealEstatePrincipal: 500,
  }, {
    tradeRepublicEquityFlow: 15,
    tradeRepublicCryptoFlow: -25,
  }), {
    tradeRepublicEquityPrincipal: 115,
    tradeRepublicCryptoPrincipal: 175,
    myInvestorEquityPrincipal: 310,
    myInvestorCryptoPrincipal: 395,
    urbanitaeRealEstatePrincipal: 520,
  })
})

test('classifies generated cash, investment flows, expenses, maturities and outbounds', () => {
  const facts = classifyTradeRepublicTransactions([
    { date: '2026-05-05', type: 'INTEREST_PAYMENT', amount: 100, tax: -19 },
    { date: '2026-05-06', type: 'DIVIDEND', amount: 50, tax: -9.5 },
    { date: '2026-05-07', type: 'BUY', assetClass: 'BOND', amount: -1000 },
    { date: '2026-05-08', type: 'SELL', assetClass: 'BOND', amount: 200 },
    { date: '2026-05-09', type: 'FINAL_MATURITY', category: 'CASH', assetClass: 'BOND', amount: 500 },
    { date: '2026-05-09', type: 'FINAL_MATURITY', category: 'CORPORATE_ACTION', assetClass: 'BOND', amount: -500 },
    { date: '2026-05-10', type: 'BUY', assetClass: 'CRYPTO', amount: -25 },
    { date: '2026-05-11', type: 'SELL', assetClass: 'CRYPTO', amount: 10 },
    { date: '2026-05-12', type: 'BUY', assetClass: 'FUND', amount: -40 },
    { date: '2026-05-13', type: 'BENEFITS_SAVEBACK', amount: 15, tax: -2.85 },
    { date: '2026-05-14', type: 'BENEFITS_SAVEBACK', assetClass: 'FUND', amount: 8 },
    { date: '2026-05-15', type: 'STOCKPERK', assetClass: 'STOCK', amount: 5 },
    { date: '2026-05-16', type: 'CARD_TRANSACTION', amount: -20 },
    { date: '2026-05-17', type: 'CARD_TRANSACTION', amount: 3 },
    { date: '2026-05-18', type: 'TRANSFER_INSTANT_INBOUND', amount: 700 },
    { date: '2026-05-19', type: 'TRANSFER_INSTANT_OUTBOUND', amount: -300, description: 'MYINVESTOR BANCO' },
  ], '2026-05-04', '2026-06-03')

  assert.equal(facts.generatedCash, 121.5)
  assert.equal(facts.tradeRepublicCashContribution, 700)
  assert.equal(facts.tradeRepublicFixedIncomeFlow, 300)
  assert.equal(facts.tradeRepublicCryptoFlow, 27.15)
  assert.equal(facts.tradeRepublicEquityFlow, 53)
  assert.equal(facts.cardExpenses, 17)
  assert.deepEqual(facts.ignoredOutbounds, [{
    date: '2026-05-19',
    amount: 300,
    description: 'MYINVESTOR BANCO',
    counterpartyName: undefined,
    paymentReference: undefined,
  }])
  assert.deepEqual(facts.generatedCashItems, [
    {
      key: '2026-05-05-INTEREST_PAYMENT-0',
      date: '2026-05-05',
      label: 'Intereses',
      detail: '',
      value: 81,
    },
    {
      key: '2026-05-06-DIVIDEND-1',
      date: '2026-05-06',
      label: 'Dividendo',
      detail: '',
      value: 40.5,
    },
  ])
})

test('dashboard exposes received payment items from Trade Republic csv', () => {
  const dashboard = calculateDashboard([{
    month: '2026-05',
    periodStart: '2026-05-04',
    periodEnd: '2026-06-03',
    caixaBalance: 0,
    tradeRepublicCashBalance: 200,
    tradeRepublicEquityValue: 0,
    tradeRepublicFixedIncomeValue: 0,
    tradeRepublicCryptoValue: 0,
    myInvestorEquityValue: 0,
    myInvestorFixedIncomeValue: 0,
    myInvestorCryptoValue: 0,
    criptanCryptoValue: 0,
    urbanitaeRealEstateValue: 0,
    generatedCash: 121,
    reportedGeneratedCash: 121,
    snapshotOrigin: 'baseline',
  }], {
    transactions: [
      { transactionId: 'bond-1', date: '2026-05-05', type: 'INTEREST_PAYMENT', assetClass: 'BOND', amount: 60, tax: -11.4, name: 'Mär. 2028', description: 'Interest Payment for ISIN XS...' },
      { transactionId: 'interest-1', date: '2026-05-06', type: 'INTEREST_PAYMENT', amount: 100, tax: -27.6, description: 'Interest payment for payout collection 019e...' },
    ],
  })

  assert.deepEqual(dashboard.snapshots[0].incomeBreakdown.items, [
    {
      key: 'bond-1',
      date: '2026-05-05',
      label: 'Cupón bono',
      detail: 'Mär. 2028',
      value: 48.6,
    },
    {
      key: 'interest-1',
      date: '2026-05-06',
      label: 'Intereses',
      detail: '',
      value: 72.4,
    },
  ])
})
