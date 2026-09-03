# Closing report schema

Use JSON. Monetary amounts are numbers in EUR rounded to cents. Dates use `YYYY-MM-DD`; timestamps include an offset.

```json
{
  "schemaVersion": 1,
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
  "orders": [],
  "warnings": [],
  "evidence": []
}
```

`status` is `provisional` or `final`. An order has `source`, `product`, `date`, `kind`, `amount`, and an optional `costBasis` and stable `id`. `kind` is one of `subscription`, `sale`, `internal-transfer`, or `other`. For a sale, `amount` is the proceeds and `costBasis` is the principal removed; they are not interchangeable.

Evidence entries should be concise and avoid secrets. Store the source name, observation time, displayed label/value, and enough location context to reproduce the observation. Never store passwords, session identifiers, account numbers, personal identifiers, cookies, or authentication tokens.
