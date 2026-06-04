import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importHistoricalSnapshots } from './database.js'
import { parseHistoricalSnapshots } from './historicalMigration.js'

const inputPath = process.argv[2]
if (!inputPath) throw new Error('Indica el fichero TSV exportado desde Excel.')

const snapshots = parseHistoricalSnapshots(readFileSync(resolve(inputPath), 'utf8'))
const result = importHistoricalSnapshots(snapshots)

console.log(JSON.stringify({
  proposed: snapshots.length,
  imported: result.imported,
  skippedExisting: result.skipped,
}, null, 2))
