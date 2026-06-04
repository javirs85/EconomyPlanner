import { useEffect, useState } from 'react'
import {
  getYearClosingStatus,
  type MonthlyClosingMonthStatus,
} from '../../application/monthlyClosing/monthlyClosing'

const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function currentTargetMonth() {
  const today = new Date()
  const target = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
}

function monthTone(status: MonthlyClosingMonthStatus) {
  if (status.snapshotSaved) return 'saved'
  const target = currentTargetMonth()
  if (status.month < target) return 'overdue'
  if (status.month === target) return 'current'
  return 'future'
}

export function ClosingCalendar({
  selectedMonth,
  onSelect,
  refreshKey,
}: {
  selectedMonth: string
  onSelect: (month: string) => void
  refreshKey: number
}) {
  const [year, setYear] = useState(Number(selectedMonth.slice(0, 4)))
  const [statuses, setStatuses] = useState<MonthlyClosingMonthStatus[]>([])
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const years = Array.from(new Set([currentYear - 1, currentYear, currentYear + 1, year])).sort()

  useEffect(() => {
    void getYearClosingStatus(year).then(setStatuses)
  }, [refreshKey, year])

  function chooseYear(nextYear: number) {
    setYear(nextYear)
    setYearMenuOpen(false)
  }

  return (
    <section className="panel closing-calendar">
      <div className="calendar-heading">
        <div><p className="eyebrow">Cierres mensuales</p><h2>Selecciona el mes que quieres completar</h2></div>
        <div className="year-picker">
          <button onClick={() => setYearMenuOpen((open) => !open)}>{year}⌄</button>
          {yearMenuOpen && <div>{years.map((option) => <button className={option === year ? 'active' : ''} key={option} onClick={() => chooseYear(option)}>{option}</button>)}</div>}
        </div>
      </div>
      <div className="month-strip">
        {statuses.map((status, index) => (
          <button className={`${monthTone(status)} ${selectedMonth === status.month ? 'selected' : ''}`} key={status.month} onClick={() => onSelect(status.month)}>
            <strong>{monthLabels[index]}</strong>
            <span className={`csv-dot ${status.csvCoverage.status}`} title={`CSV ${status.csvCoverage.status}`} />
          </button>
        ))}
      </div>
      <div className="calendar-legend">
        <span><i className="saved" /> Guardado</span><span><i className="overdue" /> Atrasado</span><span><i className="current" /> Pendiente actual</span><span><i className="csv" /> Punto = cobertura CSV</span>
      </div>
    </section>
  )
}
