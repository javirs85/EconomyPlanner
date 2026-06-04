import type {
  AssetAllocation,
  MonthlyOriginStack,
} from '../../domain/snapshots/types'

export interface DashboardSummary {
  latestMonth: string
  currentNetWorth: number
  monthlyChange?: number
  monthlyChangePercent?: number
  netContribution: number
  estimatedReturn?: number
  detectedYields: number
  marketGrowth?: number
  marketChange?: number
  passiveIncome: number
  passiveIncomeYtd: number
  attributionReady: boolean
  assets: AssetAllocation[]
}

export interface DashboardResult {
  snapshots: MonthlyOriginStack[]
  summary?: DashboardSummary
}

export async function getDashboard() {
  const response = await fetch('/api/dashboard')
  if (!response.ok) throw new Error('No se pudo cargar el dashboard.')
  return await response.json() as DashboardResult
}
