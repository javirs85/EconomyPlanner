const objectKey = 'economy-planner/data.json'

export function emptyData() {
  return {
    schemaVersion: 1,
    transactions: [],
    importBatches: [],
    monthlySnapshots: [],
  }
}

function normalizeSnapshot(snapshot) {
  return {
    ...snapshot,
    criptanCryptoValue: snapshot.criptanCryptoValue ?? 0,
    criptanExternalFlow: snapshot.criptanExternalFlow ?? 0,
    urbanitaeRealEstateValue: snapshot.urbanitaeRealEstateValue ?? 0,
    urbanitaeExternalFlow: snapshot.urbanitaeExternalFlow ?? 0,
    reportedInterest: snapshot.reportedInterest ?? 0,
    reportedBondPayments: snapshot.reportedBondPayments ?? 0,
    reportedGeneratedCash: snapshot.reportedGeneratedCash ?? 0,
  }
}

export function normalizeData(data) {
  const normalized = data && typeof data === 'object' ? data : emptyData()
  return {
    schemaVersion: 1,
    transactions: Array.isArray(normalized.transactions) ? normalized.transactions : [],
    importBatches: Array.isArray(normalized.importBatches) ? normalized.importBatches : [],
    monthlySnapshots: Array.isArray(normalized.monthlySnapshots)
      ? normalized.monthlySnapshots.map(normalizeSnapshot)
      : [],
  }
}

export async function readData(env) {
  if (!env.ECONOMY_DB) throw new Error('Falta el binding R2 ECONOMY_DB.')

  const object = await env.ECONOMY_DB.get(objectKey)
  if (!object) return emptyData()

  return normalizeData(await object.json())
}

export async function writeData(env, data) {
  if (!env.ECONOMY_DB) throw new Error('Falta el binding R2 ECONOMY_DB.')

  await env.ECONOMY_DB.put(objectKey, JSON.stringify(normalizeData(data), null, 2), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  })
}

