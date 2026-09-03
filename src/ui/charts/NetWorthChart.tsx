import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyOriginStack } from '../../domain/snapshots/types'
import { formatMoney } from '../../shared/money/formatMoney'

interface NetWorthChartProps {
  data: MonthlyOriginStack[]
  selectedPeriodEnd?: string
  onSelectSnapshot: (snapshot: MonthlyOriginStack) => void
}

interface ReturnsChartProps {
  data: MonthlyOriginStack[]
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: MonthlyOriginStack }>
}

interface ReturnsTooltipProps {
  active?: boolean
  payload?: Array<{ payload: MonthlyOriginStack, dataKey?: string | number }>
}

interface ReturnDotProps {
  cx?: number
  cy?: number
  payload?: MonthlyOriginStack
}

function returnLineColor(value: number) {
  return value < 0 ? '#c05f58' : '#3f7b5e'
}

function returnGradientOffset(data: MonthlyOriginStack[], dataKey: 'investedGrowth' | 'cashFromYields') {
  const values = data.map((snapshot) => snapshot[dataKey])
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  if (max <= 0) return 0
  if (min >= 0) return 100
  return max / (max - min) * 100
}

function ReturnDot({ cx, cy, payload }: ReturnDotProps) {
  if (cx === undefined || cy === undefined || !payload) return null
  return <circle cx={cx} cy={cy} fill={returnLineColor(payload.investedGrowth)} r={2.4} strokeWidth={0} />
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null

  const month = payload[0].payload
  return (
    <div className="chart-tooltip">
      <p className="tooltip-date">Cierre de {month.label}</p>
      <strong>{formatMoney(month.totalNetWorth)}</strong>
      {month.snapshotOrigin === 'historical-visual' && <span className="tooltip-origin">Histórico visual</span>}
      {month.snapshotOrigin === 'baseline' && <span className="tooltip-origin baseline">Baseline fiable</span>}
      <dl>
        <div><dt>Cash aportado</dt><dd>{formatMoney(month.cashFromSalary)}</dd></div>
        <div><dt>Cash generado</dt><dd>{formatMoney(month.cashFromYields)}</dd></div>
        <div><dt>Renta fija</dt><dd>{formatMoney(month.fixedIncome)}</dd></div>
        <div><dt>Renta variable</dt><dd>{formatMoney(month.equityValue)}</dd></div>
        {month.snapshotOrigin !== 'historical-visual' && <div className="tooltip-detail"><dt>Beneficio RV incluido</dt><dd>{formatMoney(month.equityGrowth)}</dd></div>}
        <div><dt>Cripto</dt><dd>{formatMoney(month.cryptoValue)}</dd></div>
        {month.snapshotOrigin !== 'historical-visual' && <div className="tooltip-detail"><dt>Beneficio cripto incluido</dt><dd>{formatMoney(month.cryptoGrowth)}</dd></div>}
        <div><dt>Urbanitae</dt><dd>{formatMoney(month.realEstateValue)}</dd></div>
      </dl>
    </div>
  )
}

function ReturnsTooltip({ active, payload }: ReturnsTooltipProps) {
  if (!active || !payload?.length) return null

  const month = payload[0].payload
  const dataKey = payload[0].dataKey
  const label = dataKey === 'cashFromYields' ? 'Cash generado' : 'Invertido generado'
  const value = dataKey === 'cashFromYields' ? month.cashFromYields : month.investedGrowth
  return (
    <div className="chart-tooltip compact-tooltip">
      <p>{month.label}</p>
      <dl>
        <div><dt>{label}</dt><dd>{formatMoney(value)}</dd></div>
      </dl>
    </div>
  )
}

const stackColors = {
  cashFromSalary: '#2f5f91',
  cashFromYields: '#86b6db',
  fixedIncome: '#8d9692',
  equityBase: '#3f7b5e',
  equityGenerated: '#a5d2b7',
  cryptoBase: '#73559d',
  cryptoGenerated: '#b19ad0',
  realEstateValue: '#c48a67',
}

const selectedStackColors = {
  cashFromSalary: '#376da2',
  cashFromYields: '#72acd6',
  fixedIncome: '#7d8884',
  equityBase: '#438764',
  equityGenerated: '#92cfa9',
  cryptoBase: '#7f60aa',
  cryptoGenerated: '#a98dca',
  realEstateValue: '#d0936c',
}

const mutedStackColors = {
  cashFromSalary: '#91a0ab',
  cashFromYields: '#c6d0d6',
  fixedIncome: '#b0b8b4',
  equityBase: '#9caea4',
  equityGenerated: '#d0ded4',
  cryptoBase: '#aaa1b7',
  cryptoGenerated: '#d6d0df',
  realEstateValue: '#d7b6a3',
}

const historicalStackColors = {
  cashFromSalary: '#617f9c',
  cashFromYields: '#adc5d8',
  fixedIncome: '#a5aca9',
  equityBase: '#6f8f7c',
  equityGenerated: '#b8d7c2',
  cryptoBase: '#877a98',
  cryptoGenerated: '#c1b7cc',
  realEstateValue: '#bc8d73',
}

function cellFill(dataKey: keyof typeof stackColors, selectedPeriodEnd: string | undefined, snapshot: MonthlyOriginStack) {
  if (snapshot.snapshotOrigin === 'historical-visual') return historicalStackColors[dataKey]
  if (!selectedPeriodEnd) return stackColors[dataKey]
  if (snapshot.periodEnd === selectedPeriodEnd) return selectedStackColors[dataKey]
  return mutedStackColors[dataKey]
}

function cellOpacity(snapshot: MonthlyOriginStack, selectedSnapshot: MonthlyOriginStack | undefined) {
  const selectedPeriodEnd = selectedSnapshot?.periodEnd
  const isSelected = snapshot.periodEnd === selectedPeriodEnd
  if (snapshot.snapshotOrigin === 'historical-visual') return !selectedPeriodEnd || isSelected ? 0.92 : 0.26
  if (selectedSnapshot?.snapshotOrigin === 'historical-visual') return 0.82
  if (!selectedPeriodEnd || isSelected) return 1
  return 0.55
}

function withCategorySegments(snapshot: MonthlyOriginStack): MonthlyOriginStack {
  if (Number.isFinite(snapshot.equityBase) && Number.isFinite(snapshot.cryptoBase)) return snapshot

  const segmentsFor = (category: 'equity' | 'crypto') => {
    const assets = snapshot.assetBreakdown.filter((asset) => asset.category === category)
    const value = assets.reduce((sum, asset) => sum + asset.value, 0)
    const growth = assets.reduce((sum, asset) => sum + (asset.growth ?? 0), 0)
    const generated = snapshot.snapshotOrigin === 'historical-visual' ? 0 : Math.min(value, Math.max(0, growth))
    return { value, growth, base: value - generated, generated }
  }
  const equity = segmentsFor('equity')
  const crypto = segmentsFor('crypto')

  return {
    ...snapshot,
    equityValue: equity.value,
    equityGrowth: equity.growth,
    equityBase: equity.base,
    equityGenerated: equity.generated,
    cryptoValue: crypto.value,
    cryptoGrowth: crypto.growth,
    cryptoBase: crypto.base,
    cryptoGenerated: crypto.generated,
    realEstateValue: snapshot.assetBreakdown
      .filter((asset) => asset.category === 'realEstate')
      .reduce((sum, asset) => sum + asset.value, 0),
  }
}

function StackBar({ data, dataKey, name, selectedPeriodEnd, onSelectSnapshot, radius }: {
  data: MonthlyOriginStack[]
  dataKey: keyof typeof stackColors
  name: string
  selectedPeriodEnd?: string
  onSelectSnapshot: (snapshot: MonthlyOriginStack) => void
  radius?: [number, number, number, number]
}) {
  const selectedSnapshot = data.find((snapshot) => snapshot.periodEnd === selectedPeriodEnd)

  return (
    <Bar
      dataKey={dataKey}
      name={name}
      stackId="worth"
      radius={radius}
      onClick={({ payload }: { payload?: MonthlyOriginStack }) => payload && onSelectSnapshot(payload)}
      cursor="pointer"
    >
      {data.map((snapshot) => (
        <Cell
          key={`${dataKey}-${snapshot.periodEnd}`}
          fill={cellFill(dataKey, selectedPeriodEnd, snapshot)}
          fillOpacity={cellOpacity(snapshot, selectedSnapshot)}
        />
      ))}
    </Bar>
  )
}

export function NetWorthChart({ data, selectedPeriodEnd, onSelectSnapshot }: NetWorthChartProps) {
  const chartData = data.map(withCategorySegments)
  const labelsByPeriodEnd = new Map(chartData.map((snapshot) => [snapshot.periodEnd, snapshot.label]))
  const yearBoundaries = chartData.filter((snapshot, index) => index > 0 && snapshot.month.slice(5, 7) === '01')

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e8ede9" />
        <XAxis dataKey="periodEnd" tickFormatter={(periodEnd) => labelsByPeriodEnd.get(periodEnd) ?? ''} axisLine={false} tickLine={false} tick={{ fill: '#78827d', fontSize: 12 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#78827d', fontSize: 12 }}
          tickFormatter={(value: number) => formatMoney(value, true)}
          width={56}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f2f6f3' }} />
        <StackBar data={chartData} dataKey="cashFromSalary" name="Cash aportado" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="cashFromYields" name="Cash generado" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="fixedIncome" name="Renta fija" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="equityBase" name="Renta variable" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="equityGenerated" name="RV generada" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="cryptoBase" name="Cripto" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="cryptoGenerated" name="Cripto generada" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="realEstateValue" name="Urbanitae" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} radius={[4, 4, 0, 0]} />
        {yearBoundaries.map((snapshot) => (
          <ReferenceLine
            key={`year-boundary-${snapshot.month}`}
            x={snapshot.periodEnd}
            stroke="#9aa9a2"
            strokeDasharray="2 4"
            strokeWidth={1.5}
            label={{
              value: snapshot.month.slice(0, 4),
              position: 'insideTop',
              fill: '#6f7f78',
              fontSize: 10,
              fontWeight: 700,
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function GeneratedReturnsChart({ data }: ReturnsChartProps) {
  const labelsByPeriodEnd = new Map(data.map((snapshot) => [snapshot.periodEnd, snapshot.label]))
  const yearBoundaries = data.filter((snapshot, index) => index > 0 && snapshot.month.slice(5, 7) === '01')

  return (
    <div className="returns-split-chart">
      <MiniReturnLineChart
        color="#3f7b5e"
        data={data}
        dataKey="investedGrowth"
        labelsByPeriodEnd={labelsByPeriodEnd}
        showXAxis={false}
        yearBoundaries={yearBoundaries}
      />
      <MiniReturnLineChart
        color="#86b6db"
        data={data}
        dataKey="cashFromYields"
        labelsByPeriodEnd={labelsByPeriodEnd}
        showXAxis
        yearBoundaries={yearBoundaries}
      />
    </div>
  )
}

function MiniReturnLineChart({
  color,
  data,
  dataKey,
  labelsByPeriodEnd,
  showXAxis,
  yearBoundaries,
}: {
  color: string
  data: MonthlyOriginStack[]
  dataKey: 'investedGrowth' | 'cashFromYields'
  labelsByPeriodEnd: Map<string, string>
  showXAxis: boolean
  yearBoundaries: MonthlyOriginStack[]
}) {
  const gradientId = `return-line-${dataKey}`
  const gradientOffset = returnGradientOffset(data, dataKey)
  const stroke = dataKey === 'investedGrowth' ? `url(#${gradientId})` : color

  return (
    <div className="returns-mini-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          {dataKey === 'investedGrowth' && (
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3f7b5e" />
                <stop offset={`${gradientOffset}%`} stopColor="#3f7b5e" />
                <stop offset={`${gradientOffset}%`} stopColor="#c05f58" />
                <stop offset="100%" stopColor="#c05f58" />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid vertical={false} stroke="#eef2ef" />
          <XAxis
            axisLine={false}
            dataKey="periodEnd"
            height={showXAxis ? 28 : 0}
            tick={showXAxis ? { fill: '#8a958f', fontSize: 11 } : false}
            tickFormatter={(periodEnd) => labelsByPeriodEnd.get(periodEnd) ?? ''}
            tickLine={false}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#8a958f', fontSize: 11 }}
            tickFormatter={(value: number) => formatMoney(value, true)}
            width={56}
          />
          <Tooltip content={<ReturnsTooltip />} cursor={{ stroke: '#d8e1dc', strokeWidth: 1 }} />
          {dataKey === 'investedGrowth' && <ReferenceLine y={0} stroke="#d9c4c1" strokeDasharray="3 4" strokeWidth={1} />}
          <Line dataKey={dataKey} type="monotone" stroke={stroke} strokeWidth={2.2} dot={dataKey === 'investedGrowth' ? <ReturnDot /> : { r: 2.4, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
          {yearBoundaries.map((snapshot) => (
            <ReferenceLine
              key={`${dataKey}-year-boundary-${snapshot.month}`}
              x={snapshot.periodEnd}
              stroke="#c4d0ca"
              strokeDasharray="2 4"
              strokeWidth={1}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
