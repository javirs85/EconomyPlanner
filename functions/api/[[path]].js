import { parseTradeRepublicCsv } from '../../server/tradeRepublicParser.js'
import { parseHistoricalSnapshots } from '../../server/historicalMigration.js'
import { getDashboard, getMonthlyClosing, getYearClosingStatus, importHistoricalSnapshots, importTransactions, exploreTransactions, latestImportedTransactionDate, saveMonthlyClosing } from '../_economyData.js'
import { readData, writeData } from '../_storage.js'

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    throw new Error('La peticion no contiene JSON valido.')
  }
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const path = url.pathname

  try {
    const data = await readData(env)

    if (request.method === 'GET' && path === '/api/trade-republic/status') {
      return json({ latestTransactionDate: latestImportedTransactionDate(data) })
    }

    if (request.method === 'GET' && path === '/api/dashboard') {
      return json(getDashboard(data))
    }

    if (request.method === 'GET' && path === '/api/trade-republic/transactions') {
      return json(exploreTransactions(data, {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        investmentsOnly: url.searchParams.get('investmentsOnly') === 'true',
        flow: url.searchParams.get('flow'),
      }))
    }

    if (request.method === 'GET' && path === '/api/monthly-closing') {
      const month = url.searchParams.get('month')
      const periodStart = url.searchParams.get('periodStart')
      const periodEnd = url.searchParams.get('periodEnd')
      if (!month || !periodStart || !periodEnd) throw new Error('Falta el periodo del cierre mensual.')
      return json(getMonthlyClosing(data, { month, periodStart, periodEnd }))
    }

    if (request.method === 'GET' && path === '/api/monthly-closing/year') {
      const year = Number(url.searchParams.get('year'))
      if (!Number.isInteger(year)) throw new Error('El ano no es valido.')
      return json(getYearClosingStatus(data, year))
    }

    if (request.method === 'POST' && path === '/api/monthly-closing') {
      const snapshot = await readJson(request)
      const result = saveMonthlyClosing(data, snapshot)
      await writeData(env, data)
      return json(result)
    }

    if (request.method === 'POST' && path === '/api/trade-republic/import') {
      const { fileName, coverageStart, coverageEnd, csv } = await readJson(request)
      if (typeof fileName !== 'string' || typeof coverageStart !== 'string' || typeof coverageEnd !== 'string' || typeof csv !== 'string') {
        throw new Error('Falta el nombre, rango de cobertura o contenido del CSV.')
      }
      const result = importTransactions(data, { fileName, coverageStart, coverageEnd, ...parseTradeRepublicCsv(csv) })
      await writeData(env, data)
      return json(result)
    }

    if (request.method === 'POST' && path === '/api/historical-migration/import') {
      const { text } = await readJson(request)
      if (typeof text !== 'string' || !text.trim()) throw new Error('Falta la tabla historica.')
      const result = importHistoricalSnapshots(data, parseHistoricalSnapshots(text))
      await writeData(env, data)
      return json(result)
    }

    return json({ error: 'Ruta no encontrada.' }, 404)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 400)
  }
}
