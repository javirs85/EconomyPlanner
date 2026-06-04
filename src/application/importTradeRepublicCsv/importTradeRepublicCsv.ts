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

async function readJsonResponse<T extends object>(response: Response, fallbackMessage: string) {
  const text = await response.text()
  let result: T | { error: string }

  try {
    result = JSON.parse(text) as T | { error: string }
  } catch {
    throw new Error(text.trim() || fallbackMessage)
  }

  if (!response.ok || 'error' in result) {
    throw new Error('error' in result ? result.error : fallbackMessage)
  }

  return result
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

  return await readJsonResponse<ImportBatch>(response, 'No se pudo importar el CSV.')
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

  return await readJsonResponse<TransactionExplorerResult>(response, 'No se pudieron consultar los movimientos.')
}
