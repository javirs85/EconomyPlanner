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
  payload?: Array<{ payload: MonthlyOriginStack }>
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null

  const month = payload[0].payload
  const historicalInvestment = month.investedPrincipal + month.investedGrowth

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
        {month.snapshotOrigin === 'historical-visual'
          ? <div><dt>Invertido visual</dt><dd>{formatMoney(historicalInvestment)}</dd></div>
          : (
            <>
              <div><dt>Invertido aportado</dt><dd>{formatMoney(month.investedPrincipal)}</dd></div>
              <div><dt>Invertido generado</dt><dd>{formatMoney(month.investedGrowth)}</dd></div>
            </>
          )}
        <div><dt>Inmobiliario aportado</dt><dd>{formatMoney(month.realEstatePrincipal)}</dd></div>
      </dl>
    </div>
  )
}

function ReturnsTooltip({ active, payload }: ReturnsTooltipProps) {
  if (!active || !payload?.length) return null

  const month = payload[0].payload
  return (
    <div className="chart-tooltip compact-tooltip">
      <p>{month.label}</p>
      <dl>
        <div><dt>Invertido generado</dt><dd>{formatMoney(month.investedGrowth)}</dd></div>
        <div><dt>Cash generado</dt><dd>{formatMoney(month.cashFromYields)}</dd></div>
      </dl>
    </div>
  )
}

const stackColors = {
  cashFromSalary: '#2f5f91',
  cashFromYields: '#86b6db',
  fixedIncome: '#8d9692',
  investedPrincipal: '#3f7b5e',
  investedGrowth: '#a5d2b7',
  realEstatePrincipal: '#c48a67',
}

const selectedStackColors = {
  cashFromSalary: '#376da2',
  cashFromYields: '#72acd6',
  fixedIncome: '#7d8884',
  investedPrincipal: '#438764',
  investedGrowth: '#92cfa9',
  realEstatePrincipal: '#d0936c',
}

const mutedStackColors = {
  cashFromSalary: '#91a0ab',
  cashFromYields: '#c6d0d6',
  fixedIncome: '#b0b8b4',
  investedPrincipal: '#9caea4',
  investedGrowth: '#d0ded4',
  realEstatePrincipal: '#d7b6a3',
}

const historicalStackColors = {
  cashFromSalary: '#617f9c',
  cashFromYields: '#adc5d8',
  fixedIncome: '#a5aca9',
  investedPrincipal: '#6f8f7c',
  investedGrowth: '#6f8f7c',
  realEstatePrincipal: '#bc8d73',
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
  const chartData = data.map((snapshot) => snapshot.snapshotOrigin === 'historical-visual'
    ? { ...snapshot, investedPrincipal: snapshot.investedPrincipal + snapshot.investedGrowth, investedGrowth: 0 }
    : snapshot)
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
        <StackBar data={chartData} dataKey="investedPrincipal" name="Invertido aportado" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="investedGrowth" name="Invertido generado" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} />
        <StackBar data={chartData} dataKey="realEstatePrincipal" name="Inmobiliario aportado" selectedPeriodEnd={selectedPeriodEnd} onSelectSnapshot={onSelectSnapshot} radius={[4, 4, 0, 0]} />
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
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2ef" />
        <XAxis dataKey="periodEnd" tickFormatter={(periodEnd) => labelsByPeriodEnd.get(periodEnd) ?? ''} axisLine={false} tickLine={false} tick={{ fill: '#8a958f', fontSize: 11 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#8a958f', fontSize: 11 }}
          tickFormatter={(value: number) => formatMoney(value, true)}
          width={56}
        />
        <Tooltip content={<ReturnsTooltip />} cursor={{ stroke: '#d8e1dc', strokeWidth: 1 }} />
        <Line dataKey="investedGrowth" name="Invertido generado" type="monotone" stroke="#3f7b5e" strokeWidth={2.2} dot={{ r: 2.4, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line dataKey="cashFromYields" name="Cash generado" type="monotone" stroke="#86b6db" strokeWidth={2.2} dot={{ r: 2.4, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} />
        {yearBoundaries.map((snapshot) => (
          <ReferenceLine
            key={`returns-year-boundary-${snapshot.month}`}
            x={snapshot.periodEnd}
            stroke="#c4d0ca"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
