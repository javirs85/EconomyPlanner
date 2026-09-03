import { readFile } from 'node:fs/promises'

const reportPath = process.argv[2]
if (!reportPath) {
  console.error('Usage: node validate-closing-report.mjs <report.json>')
  process.exit(2)
}

const report = JSON.parse(await readFile(reportPath, 'utf8'))
const errors = []
const warnings = []
const moneySections = ['balances', 'flows', 'principals', 'profits']
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function requireValue(condition, message) {
  if (!condition) errors.push(message)
}

requireValue(report.schemaVersion === 1, 'schemaVersion must be 1')
requireValue(/^\d{4}-\d{2}$/.test(report.month ?? ''), 'month must use YYYY-MM')
requireValue(datePattern.test(report.periodStart ?? ''), 'periodStart must use YYYY-MM-DD')
requireValue(datePattern.test(report.periodEnd ?? ''), 'periodEnd must use YYYY-MM-DD')
requireValue(['provisional', 'final'].includes(report.status), 'status must be provisional or final')
requireValue(report.sources && typeof report.sources === 'object', 'sources is required')

if (datePattern.test(report.periodStart ?? '') && datePattern.test(report.periodEnd ?? '')) {
  const [year, month] = report.month.split('-').map(Number)
  const expectedStart = `${report.month}-04`
  const expectedEnd = new Date(Date.UTC(year, month, 3)).toISOString().slice(0, 10)
  requireValue(report.periodStart === expectedStart, `periodStart must be ${expectedStart}`)
  requireValue(report.periodEnd === expectedEnd, `periodEnd must be ${expectedEnd}`)
}

for (const section of moneySections) {
  requireValue(report[section] && typeof report[section] === 'object', `${section} is required`)
  for (const [key, value] of Object.entries(report[section] ?? {})) {
    requireValue(typeof value === 'number' && Number.isFinite(value), `${section}.${key} must be a finite number`)
    if (typeof value === 'number' && Math.abs(Math.round(value * 100) - value * 100) > 1e-8) {
      warnings.push(`${section}.${key} has more than two decimals`)
    }
  }
}

const tr = report.sources?.tradeRepublic
if (!tr || tr.kind !== 'csv') errors.push('Trade Republic CSV source is required')
else if (tr.coverageStart > report.periodStart || tr.coverageEnd < report.periodEnd) {
  const message = `Trade Republic CSV does not cover ${report.periodStart} through ${report.periodEnd}`
  if (report.status === 'final') errors.push(message)
  else warnings.push(message)
}

for (const source of ['myInvestor', 'caixa']) {
  if (!report.sources?.[source]?.observedAt) warnings.push(`${source} observation time is missing`)
}

const orderKeys = new Set()
for (const [index, order] of (report.orders ?? []).entries()) {
  requireValue(datePattern.test(order.date ?? ''), `orders[${index}].date must use YYYY-MM-DD`)
  requireValue(typeof order.amount === 'number' && Number.isFinite(order.amount), `orders[${index}].amount must be a finite number`)
  if (order.kind === 'sale') {
    requireValue(typeof order.costBasis === 'number' && Number.isFinite(order.costBasis), `orders[${index}].costBasis is required for a sale`)
  }
  if (order.date < report.periodStart || order.date > report.periodEnd) warnings.push(`orders[${index}] falls outside the closing period`)
  const key = order.id ?? `${order.source}|${order.product}|${order.date}|${order.kind}|${order.amount}`
  if (orderKeys.has(key)) errors.push(`duplicate order: ${key}`)
  orderKeys.add(key)
}

for (const warning of report.warnings ?? []) warnings.push(String(warning))

console.log(JSON.stringify({ valid: errors.length === 0, errors, warnings }, null, 2))
process.exitCode = errors.length === 0 ? 0 : 1
