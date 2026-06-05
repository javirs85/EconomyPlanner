import { createServer } from 'node:http'
import { applyHistoricalTradeRepublicEquityAdjustments, exploreTransactions, getDashboard, getMonthlyClosing, getYearClosingStatus, importHistoricalSnapshots, importTransactions, latestImportedTransactionDate, saveMonthlyClosing } from './database.js'
import { parseHistoricalSnapshots, parseTradeRepublicEquityAdjustments } from './historicalMigration.js'
import { parseTradeRepublicCsv } from './tradeRepublicParser.js'

const port = 5174

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 10_000_000) reject(new Error('El CSV es demasiado grande.'))
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('La petición no contiene JSON válido.'))
      }
    })
    request.on('error', reject)
  })
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')

    if (request.method === 'GET' && url.pathname === '/api/trade-republic/status') {
      sendJson(response, 200, { latestTransactionDate: latestImportedTransactionDate() })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard') {
      sendJson(response, 200, getDashboard())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/trade-republic/transactions') {
      sendJson(response, 200, exploreTransactions({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        investmentsOnly: url.searchParams.get('investmentsOnly') === 'true',
        flow: url.searchParams.get('flow'),
      }))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/monthly-closing') {
      const month = url.searchParams.get('month')
      const periodStart = url.searchParams.get('periodStart')
      const periodEnd = url.searchParams.get('periodEnd')
      if (!month || !periodStart || !periodEnd) throw new Error('Falta el periodo del cierre mensual.')
      sendJson(response, 200, getMonthlyClosing({ month, periodStart, periodEnd }))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/monthly-closing/year') {
      const year = Number(url.searchParams.get('year'))
      if (!Number.isInteger(year)) throw new Error('El año no es válido.')
      sendJson(response, 200, getYearClosingStatus(year))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/monthly-closing') {
      const snapshot = await readJson(request)
      sendJson(response, 200, saveMonthlyClosing(snapshot))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/trade-republic/import') {
      const { fileName, coverageStart, coverageEnd, csv } = await readJson(request)
      if (typeof fileName !== 'string' || typeof coverageStart !== 'string' || typeof coverageEnd !== 'string' || typeof csv !== 'string') {
        throw new Error('Falta el nombre, rango de cobertura o contenido del CSV.')
      }
      sendJson(response, 200, importTransactions({ fileName, coverageStart, coverageEnd, ...parseTradeRepublicCsv(csv) }))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/historical-migration/import') {
      const { text, tradeRepublicEquityAdjustmentsText } = await readJson(request)
      if (typeof text !== 'string' || !text.trim()) throw new Error('Falta la tabla historica.')
      sendJson(response, 200, importHistoricalSnapshots(parseHistoricalSnapshots(text, tradeRepublicEquityAdjustmentsText)))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/historical-migration/tr-equity-adjustments') {
      const { tradeRepublicEquityAdjustmentsText } = await readJson(request)
      if (typeof tradeRepublicEquityAdjustmentsText !== 'string' || !tradeRepublicEquityAdjustmentsText.trim()) throw new Error('Faltan los ajustes TR RV.')
      sendJson(response, 200, applyHistoricalTradeRepublicEquityAdjustments(parseTradeRepublicEquityAdjustments(tradeRepublicEquityAdjustmentsText)))
      return
    }

    sendJson(response, 404, { error: 'Ruta no encontrada.' })
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'Error inesperado.' })
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`EconomyPlanner API ready on http://127.0.0.1:${port}`)
})
