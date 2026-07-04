'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchStaffMonthlyDetail, type StaffDayDetail } from '@/app/actions/payroll'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')

function CalendarGrid({ year, month, details }: { year: number; month: number; details: StaffDayDetail[] }) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const byDate = new Map<string, StaffDayDetail[]>()
  for (const d of details) {
    if (!byDate.has(d.date)) byDate.set(d.date, [])
    byDate.get(d.date)!.push(d)
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-bold py-1.5 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-ink-muted'}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[54px]" />
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
          const dayShifts = byDate.get(dateStr) ?? []
          const isToday = dateStr === todayStr
          const isWork = dayShifts.length > 0
          const dow = i % 7
          return (
            <div
              key={i}
              className={`rounded-lg p-1.5 min-h-[54px] flex flex-col gap-0.5 ${
                isWork ? 'bg-primary-50 border border-primary-200' : 'bg-canvas-soft/50'
              } ${isToday ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}
            >
              <span className={`text-[12px] font-bold leading-none ${
                dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : isWork ? 'text-primary-700' : 'text-ink-muted'
              }`}>{day}</span>
              {dayShifts.map((s, si) => (
                <span key={si} className="text-[9px] font-bold text-primary-700 bg-primary-100 rounded px-1 py-0.5 leading-tight truncate">
                  {s.shiftName}
                </span>
              ))}
              {isWork && (
                <span className="text-[9px] text-primary-400 mt-auto leading-tight">
                  {dayShifts[0].startTime.slice(0, 5)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface Props {
  staffId: number
  name: string
  onClose: () => void
}

export { CalendarGrid }

export default function StaffCalendarModal({ staffId, name, onClose }: Props) {
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [details, setDetails] = useState<StaffDayDetail[] | null>(null)

  useEffect(() => {
    setDetails(null)
    fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m).then(res => {
      setDetails(res.success && res.data ? res.data : [])
    })
  }, [staffId, cursor.y, cursor.m])

  const prevMonth = () => setCursor(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const nextMonth = () => setCursor(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })

  const workDays = details?.length ?? 0
  const totalHours = details ? Math.round(details.reduce((s, d) => s + d.hours, 0) * 10) / 10 : 0

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline [scrollbar-width:thin]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-canvas-soft sticky top-0 z-10">
          <div>
            <h3 className="m-0 text-[15px] font-bold text-ink">{name}</h3>
            <p className="m-0 text-[11px] text-ink-muted mt-0.5">근무 캘린더</p>
          </div>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-canvas border border-hairline text-ink-muted hover:bg-canvas-soft cursor-pointer flex items-center justify-center transition text-base">‹</button>
            <div className="text-center">
              <p className="m-0 text-[15px] font-bold text-ink">{cursor.y}년 {cursor.m + 1}월</p>
              {details !== null && details.length > 0 && (
                <p className="m-0 text-[11px] text-primary-600 font-semibold">{workDays}일 · {totalHours}시간</p>
              )}
            </div>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-canvas border border-hairline text-ink-muted hover:bg-canvas-soft cursor-pointer flex items-center justify-center transition text-base">›</button>
          </div>

          {details === null ? (
            <div className="flex items-center justify-center py-12 text-[13px] text-ink-muted">불러오는 중...</div>
          ) : (
            <>
              <CalendarGrid year={cursor.y} month={cursor.m} details={details} />
              {details.length === 0 && (
                <p className="text-center text-[12px] text-ink-faint mt-4 mb-2">이달 배정된 근무가 없습니다.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
