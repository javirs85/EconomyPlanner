import type {
  ImportBatch,
  TransactionExplorerResult,
} from '../../infrastructure/tradeRepublic/types'

export async function getLatestImportedTransactionDate() {
  const response = await fetch('/api/trade-republic/status')
  if (!response.ok) throw new Error('No se pudo consultar la base de datos local.')

  const status = await response.json() as { latestTransactionDate?: string }
  return status.latestTransactionDate
}

export async function importTradeRepublicCsv(file: File, coverageStart: string, coverageEnd: string) {
  const response = await fetch('/api/trade-republic/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      coverageStart,
      coverageEnd,
      csv: await file.text(),
    }),
  })

  const result = await response.json() as ImportBatch | { error: string }
  if (!response.ok || 'error' in result) {
    throw new Error('error' in result ? result.error : 'No se pudo importar el CSV.')
  }

  return result
}

export async function exploreTradeRepublicTransactions({
  from,
  to,
  investmentsOnly,
  flow,
}: {
  from: string
  to: string
  investmentsOnly: boolean
  flow?: string
}) {
  const query = new URLSearchParams({
    from,
    to,
    investmentsOnly: String(investmentsOnly),
  })
  if (flow) query.set('flow', flow)
  const response = await fetch(`/api/trade-republic/transactions?${query}`)
  if (!response.ok) throw new Error('No se pudieron consultar los movimientos.')

  return await response.json() as TransactionExplorerResult
}
