---
name: economy-planner-monthly-closing
description: Collect, reconcile, preview, and optionally publish an Economy Planner monthly closing using a Trade Republic CSV, read-only browser evidence from MyInvestor and Caixa, and user-supplied Criptan and Urbanitae values. Use for preparing, checking, correcting, or uploading a real monthly closing; do not use for general portfolio discussion.
---

# Economy Planner Monthly Closing

Produce a traceable closing report before changing live data. Treat collection, validation, review, and publication as separate stages.

## Required inputs

At the start, determine the requested closing month and derive its period: day 4 of that month through day 3 of the following month, inclusive.

Ask the user for all missing user-provided inputs in one concise request:

- The Trade Republic CSV covering the entire closing period. Before asking for it, give these export instructions: in the Trade Republic mobile app—not the website—open **Usuario → Certificados y extractos → Exportación de transacciones**, select the derived start and end dates, and export the CSV. Write the dates with Spanish month names as displayed by the app; for example, a July closing uses **04 de julio–03 de agosto**. Do not replace the CSV with estimates from the dashboard.
- The four Trade Republic closing values shown by the mobile app: cash/current account, equity, fixed income, and crypto. Also request the displayed cumulative profit for each invested category when available so invested principal can be derived as `value - profit`. Explain that the CSV proves movements but does not contain closing market valuations or the cost basis removed by a sale. Accept a screenshot or typed values, and record its observation date.
- The Criptan closing value and external flow during the period.
- The Urbanitae closing value and external flow during the period.

If the period has not ended, offer a provisional report. Do not publish it as a final closing unless the user explicitly accepts incomplete coverage.

## Collection

Use existing authenticated browser tabs when available. The user performs login and any MFA. Keep browser work read-only.

For MyInvestor, begin at the products overview and inventory every investment section before opening individual products. Do not assume the website's product section matches Economy Planner's economic category: for example, a Bitcoin ETP can appear under **Acciones y ETF** but belongs in MyInvestor crypto for Economy Planner. Then collect:

- Total value, invested capital, and displayed profit for each product, grouped into Economy Planner's equity, fixed-income, and crypto categories.
- Executed orders within the closing period for every held fund, share, ETF, ETP, and crypto product. Filter each product's order list by a range that contains the period; classify subscriptions, purchases, sales, and internal transfers. After changing a date filter, wait for the selected state before applying it because MyInvestor updates the dialog asynchronously.
- Exact observation time and the valuation date displayed by MyInvestor.

For Caixa, collect the closing/current account balance and its observation time. Inspect movements only when needed to reconcile transfers or when the user asks.

For Trade Republic, parse the supplied CSV with the repository's existing importer/domain logic whenever possible. Record CSV coverage dates and import summary. Do not infer missing transactions from balance changes.

When the CSV contains a sale, do not use net sale proceeds as the reduction in invested principal. Compare the principal implied by the source (`closing value - displayed cumulative profit`) with the application's rolled principal. Derive the disposed cost basis when the evidence permits it; otherwise flag the closing as unreconciled. The current Economy Planner transaction classifier may use sale proceeds as a flow, so never assume its resulting principal is correct without this check.

Never treat a transfer between the user's own accounts as new household saving. Still count purchases and sales when rolling an individual asset's invested principal. Flag any case where the current application schema cannot represent both facts without conflating them.

## Reconciliation

Read [references/report-schema.md](references/report-schema.md) before creating a report. Save the proposed report in a user-approved project location or return it directly when no file is requested.

For each principal-bearing asset, check:

`expected principal = previous principal + subscriptions - sales at cost basis + external principal adjustments`

Also check:

- Sum of components equals the source total.
- `value - principal` equals the reported or proposed unrealized profit.
- For every sale, principal decreases by disposed cost basis rather than proceeds; realized gain or loss must not remain inside unrealized profit.
- Orders fall inside the closing period and are not duplicated.
- The observation/valuation date matches the requested closing date; otherwise mark it explicitly as a timing mismatch.
- CSV coverage includes every day in the period.
- Proposed values reconcile against the previous Economy Planner snapshot.

Run `node scripts/validate-closing-report.mjs <report.json>` from this skill directory. Resolve every error before proposing publication. Warnings require explicit disclosure but may remain when the evidence is inherently incomplete.

## Review and publication

Present a compact preview containing old value, proposed value, difference, evidence source, and warnings. Publication is a separate external mutation: obtain explicit confirmation immediately before writing unless the current user message directly and unambiguously requested publishing this exact reviewed report.

When publishing through the Economy Planner API:

1. Re-read the affected snapshots immediately before mutation and retain the original JSON in the task context or a recoverable artifact.
2. Apply dependent snapshots chronologically so carried principals are recalculated correctly.
3. Re-read `/api/dashboard` and verify the expected values after publication.
4. Stop on the first mismatch. Do not retry a mutation blindly.

Do not publish through an unauthenticated endpoint without warning the user that anyone knowing the endpoint may be able to alter the data. Prefer a preview/apply endpoint with authentication when it exists.
