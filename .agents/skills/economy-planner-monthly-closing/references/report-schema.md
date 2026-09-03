# Closing report schema

Use JSON. Monetary amounts are numbers in EUR rounded to cents. Dates use `YYYY-MM-DD`; timestamps include an offset.

```json
{
  "schemaVersion": 2,
  "month": "2026-08",
  "periodStart": "2026-08-04",
  "periodEnd": "2026-09-03",
  "status": "provisional",
  "sources": {
    "tradeRepublic": {
      "kind": "csv",
      "coverageStart": "2026-08-04",
      "coverageEnd": "2026-09-03",
      "fileName": "trade-republic.csv"
    },
    "myInvestor": {
      "kind": "browser",
      "observedAt": "2026-09-03T08:00:00+02:00",
      "valuationDate": "2026-09-02"
    },
    "caixa": {
      "kind": "browser",
      "observedAt": "2026-09-03T08:05:00+02:00"
    },
    "criptan": { "kind": "user" },
    "urbanitae": { "kind": "user" }
  },
  "balances": {
    "caixa": 0,
    "tradeRepublicCash": 0,
    "tradeRepublicEquity": 0,
    "tradeRepublicFixedIncome": 0,
    "tradeRepublicCrypto": 0,
    "myInvestorEquity": 0,
    "myInvestorFixedIncome": 0,
    "myInvestorCrypto": 0,
    "criptanCrypto": 0,
    "urbanitaeRealEstate": 0
  },
  "flows": {
    "myInvestorEquity": 0,
    "myInvestorFixedIncome": 0,
    "myInvestorCrypto": 0,
    "criptan": 0,
    "urbanitae": 0
  },
  "principals": {
    "tradeRepublicEquity": 0,
    "tradeRepublicFixedIncome": 0,
    "tradeRepublicCrypto": 0,
    "myInvestorEquity": 0,
    "myInvestorFixedIncome": 0,
    "myInvestorCrypto": 0,
    "urbanitaeRealEstate": 0
  },
  "profits": {
    "tradeRepublicEquity": 0,
    "tradeRepublicFixedIncome": 0,
    "tradeRepublicCrypto": 0,
    "myInvestorEquity": 0,
    "myInvestorFixedIncome": 0,
    "myInvestorCrypto": 0,
    "urbanitaeRealEstate": 0
  },
  "orders": [
    {
      "source": "Trade Republic",
      "product": "Example ETF",
      "date": "2026-08-31",
      "kind": "sale",
      "amount": 900,
      "costBasis": 1000,
      "realizedProfit": -100,
      "realizedProfitSource": "trade-republic-web",
      "id": "stable-transaction-id"
    }
  ],
  "warnings": [],
  "evidence": []
}
```

`status` is `provisional` or `final`. An order has `source`, `product`, `date`, `kind`, `amount`, and an optional stable `id`. `kind` is one of `subscription`, `sale`, `internal-transfer`, or `other`. For a sale, `amount` is the proceeds, `costBasis` is the principal removed, and `realizedProfit` is the exact profit or loss displayed by the source; they are not interchangeable.

Schema version 2 requires every Trade Republic sale in a final report to include `realizedProfit` and `realizedProfitSource: "trade-republic-web"`. Add an evidence entry with the same order ID and the web location where the expanded transaction detail was observed. Schema version 1 remains valid only for reports produced before this requirement was introduced.

Normally `realizedProfit = amount - costBasis`. If Trade Republic displays a different result because its figure and the CSV proceeds apply fees or taxes differently, preserve the displayed value, explain the difference in `warnings`, and record both bases in the evidence entry rather than silently forcing equality.

Evidence entries should be concise and avoid secrets. Store the source name, observation time, displayed label/value, and enough location context to reproduce the observation. Never store passwords, session identifiers, account numbers, personal identifiers, cookies, or authentication tokens.
