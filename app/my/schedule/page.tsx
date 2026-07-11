'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import NavBar from '@/components/NavBar'
import { getMyStaffProfile } from '@/app/actions/staff'
import { fetchStaffMonthlyDetail, type StaffDayDetail } from '@/app/actions/payroll'
import { getMyRoster, type MyShift } from '@/app/actions/roster'
import { formatBreakMinutes } from '@/lib/utils'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function hhmm(t: string) { return t.slice(0, 5) }
function dayColor(day: number, fallback = 'text-ink-muted') {
  return day === 0 ? 'text-red-500' : day === 6 ? 'text-blue-500' : fallback
}
function dDayLabel(dateStr: string, today: string): string {
  const diff = Math.round((new Date(dateStr + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
  if (diff <= 0) return '오늘'
  if (diff === 1) return '내일'
  return `${diff}일 후`
}

export default function MySchedulePage() {
  const [staffId, setStaffId] = useState<number | null>(null)
  const [staffName, setStaffName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null)
  const [details, setDetails] = useState<StaffDayDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [allShifts, setAllShifts] = useState<MyShift[]>([])
  const [showAll, setShowAll] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = todayStr()
  const upcomingShifts = useMemo(() => allShifts.filter(s => s.work_date >= today), [allShifts, today])
  const nextShift = upcomingShifts[0] ?? null

  const loadRoster = useCallback(async () => {
    const res = await getMyRoster()
    if (res.success && res.data) setAllShifts(res.data.shifts)
  }, [])

  useEffect(() => {
    const now = new Date()
    setCursor({ y: now.getFullYear(), m: now.getMonth() })
    Promise.all([getMyStaffProfile(), getMyRoster()]).then(([profileRes, rosterRes]) => {
      if (profileRes.success && profileRes.data) {
        setStaffId(profileRes.data.id)
        setStaffName(profileRes.data.name)
      }
      if (rosterRes.success && rosterRes.data) {
        setAllShifts(rosterRes.data.shifts)
      }
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!cursor || !staffId) return
    setIsLoading(true)
    setSelectedDate(null)
    fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m).then(res => {
      if (res.success && res.data) setDetails(res.data)
      else setDetails([])
      setIsLoading(false)
    })
  }, [cursor, staffId])

  // 앱 복귀/탭 전환 시 최신 스케줄로 갱신 — 관리자가 배정을 바꿔도 새로고침 없이 반영
  useEffect(() => {
    const onFocus = () => {
      loadRoster()
      if (staffId && cursor) {
        fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m).then(res => {
          if (res.success && res.data) setDetails(res.data)
        })
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [staffId, cursor, loadRoster])

  const prevMonth = () => setCursor(c => c ? (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }) : c)
  const nextMonth = () => setCursor(c => c ? (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }) : c)
  const goToday = () => { const now = new Date(); setCursor({ y: now.getFullYear(), m: now.getMonth() }) }

  const totalDays = new Set(details.map(d => d.date)).size
  const totalHours = Math.round(details.reduce((sum, d) => sum + d.hours, 0) * 10) / 10
  const visibleShifts = showAll ? upcomingShifts : upcomingShifts.slice(0, 5)

  if (!loaded || !cursor) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-ink-faint text-sm">불러오는 중...</p>
        </main>
      </>
    )
  }

  if (!staffId) {
    return (
      <>
        <NavBar />
        <main className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-[16px] font-bold text-ink mb-2">아직 등록된 근무 정보가 없습니다</p>
            <p className="text-[14px] text-ink-muted">관리자에게 문의해 주세요.</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-4 pb-10">
        <div className="max-w-[560px] mx-auto space-y-4">

          <h1 className="m-0 text-[19px] font-extrabold text-ink">{staffName}님의 근무 일정</h1>

          {/* 다음 근무 히어로 카드 */}
          {nextShift ? (
            <NextShiftCard shift={nextShift} today={today} />
          ) : (
            <div className="rounded-2xl bg-primary-700 text-white p-5">
              <p className="m-0 text-[12px] font-bold opacity-70">다음 근무</p>
              <p className="m-0 mt-1.5 text-[17px] font-bold">예정된 근무가 없습니다</p>
              <p className="m-0 mt-1 text-[13px] opacity-70">새 스케줄이 배정되면 여기에 표시됩니다.</p>
            </div>
          )}

          {/* 예정 근무 리스트 */}
          <section className="bg-canvas rounded-2xl border border-hairline shadow-level-1 p-4">
            <h2 className="m-0 mb-3 text-[16px] font-bold text-ink">
              예정 근무
              {upcomingShifts.length > 0 && (
                <span className="ml-1.5 text-[13px] font-semibold text-ink-faint">{upcomingShifts.length}건</span>
              )}
            </h2>
            {upcomingShifts.length === 0 ? (
              <p className="m-0 text-[14px] text-ink-muted">예정된 근무가 없습니다.</p>
            ) : (
              <>
                <div className="flex flex-col">
                  {visibleShifts.map((s, i) => (
                    <ShiftRow key={`${s.work_date}-${s.shift_name}-${s.start_time}`} shift={s} today={today} isFirst={i === 0} />
                  ))}
                </div>
                {upcomingShifts.length > 5 && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full mt-3 py-2.5 rounded-xl border border-hairline bg-transparent text-[13px] text-ink-muted font-semibold cursor-pointer hover:bg-canvas-soft transition-colors"
                  >
                    {showAll ? '접기' : `${upcomingShifts.length - 5}개 더 보기`}
                  </button>
                )}
              </>
            )}
          </section>

          {/* 월 달력 */}
          <section className="bg-canvas rounded-2xl border border-hairline shadow-level-1 p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="m-0 text-[16px] font-bold text-ink">{cursor.y}년 {cursor.m + 1}월</h2>
              <div className="flex items-center gap-1.5">
                <button onClick={prevMonth} aria-label="이전 달" className="w-9 h-9 rounded-xl bg-canvas-soft border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-base flex items-center justify-center">‹</button>
                <button onClick={goToday} className="px-3 h-9 rounded-xl bg-canvas-soft border border-hairline text-[13px] font-semibold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition">이번달</button>
                <button onClick={nextMonth} aria-label="다음 달" className="w-9 h-9 rounded-xl bg-canvas-soft border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-base flex items-center justify-center">›</button>
              </div>
            </div>
            <p className="m-0 mb-3 text-[13px] text-ink-muted">
              {isLoading ? '불러오는 중...' : totalDays === 0 ? '이달 배정된 근무가 없습니다' : (
                <>근무 <span className="font-bold text-primary-700">{totalDays}일</span> · 총 <span className="font-bold text-primary-700">{totalHours}시간</span></>
              )}
            </p>

            {!isLoading && (
              <>
                <WorkerCalendar
                  year={cursor.y}
                  month={cursor.m}
                  details={details}
                  today={today}
                  selectedDate={selectedDate}
                  onSelectDate={d => setSelectedDate(prev => prev === d ? null : d)}
                />
                {selectedDate && (
                  <DayDetail
                    dateStr={selectedDate}
                    entries={details.filter(d => d.date === selectedDate)}
                    allShifts={allShifts}
                  />
                )}
              </>
            )}
          </section>

        </div>
      </main>
    </>
  )
}

// ── 다음 근무 히어로 카드 ─────────────────────────────────────────────────────

function NextShiftCard({ shift, today }: { shift: MyShift; today: string }) {
  const d = new Date(shift.work_date + 'T00:00:00')
  const day = d.getDay()
  return (
    <div className="rounded-2xl bg-primary-700 text-white p-5 shadow-level-1">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[12px] font-bold opacity-70">다음 근무</p>
        <span className="text-[12px] font-extrabold px-2.5 py-1 rounded-full bg-white/15">
          {dDayLabel(shift.work_date, today)}
        </span>
      </div>
      <p className="m-0 mt-2 text-[16px] font-bold">
        {d.getMonth() + 1}월 {d.getDate()}일 <span className="opacity-80">{DAY_NAMES[day]}요일</span>
      </p>
      <p className="m-0 mt-1 text-[32px] font-extrabold leading-tight tracking-tight">
        {hhmm(shift.start_time)} <span className="opacity-50 font-bold">~</span> {hhmm(shift.end_time)}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5 text-[13px]">
        <span className="font-bold px-2 py-0.5 rounded-full bg-white/15">{shift.shift_name}</span>
        {shift.breakMinutes > 0 ? (
          <span className="opacity-80">휴게 {formatBreakMinutes(shift.breakMinutes)} · 실 근무 {shift.netHours}시간</span>
        ) : (
          <span className="opacity-80">{shift.hours}시간 근무</span>
        )}
      </div>
    </div>
  )
}

// ── 예정 근무 행 ─────────────────────────────────────────────────────────────

function ShiftRow({ shift, today, isFirst }: { shift: MyShift; today: string; isFirst: boolean }) {
  const d = new Date(shift.work_date + 'T00:00:00')
  const day = d.getDay()
  const isToday = shift.work_date === today
  return (
    <div className={`flex items-center gap-3 py-3 ${!isFirst ? 'border-t border-hairline' : ''} ${isToday ? '-mx-2 px-2 rounded-xl bg-primary-50' : ''}`}>
      {/* 날짜 블록 */}
      <div className="w-11 shrink-0 text-center">
        <p className="m-0 text-[19px] font-extrabold text-ink leading-none">{d.getDate()}</p>
        <p className={`m-0 mt-1 text-[12px] font-bold ${dayColor(day)}`}>
          {d.getMonth() + 1}월 ({DAY_NAMES[day]})
        </p>
      </div>
      {/* 파트 + 시간 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">{shift.shift_name}</span>
          {isToday && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-700 text-white">오늘</span>}
        </div>
        <p className="m-0 mt-1 text-[15px] font-bold text-ink">
          {hhmm(shift.start_time)} ~ {hhmm(shift.end_time)}
        </p>
      </div>
      {/* 시간 요약 */}
      <div className="text-right shrink-0">
        <p className="m-0 text-[14px] font-bold text-ink">{shift.hours}시간</p>
        {shift.breakMinutes > 0 && (
          <p className="m-0 mt-0.5 text-[11px] text-ink-faint">휴게 {formatBreakMinutes(shift.breakMinutes)} · 실 {shift.netHours}h</p>
        )}
      </div>
    </div>
  )
}

// ── 근로자용 월 달력 ──────────────────────────────────────────────────────────

function WorkerCalendar({ year, month, details, today, selectedDate, onSelectDate }: {
  year: number
  month: number
  details: StaffDayDetail[]
  today: string
  selectedDate: string | null
  onSelectDate: (d: string) => void
}) {
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
          <div key={d} className={`text-center text-[12px] font-bold py-1.5 ${dayColor(i)}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[64px]" />
          const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`
          const dayShifts = byDate.get(dateStr) ?? []
          const isWork = dayShifts.length > 0
          const isToday = dateStr === today
          const isSelected = dateStr === selectedDate
          const dow = i % 7
          const inner = (
            <>
              <span className={`text-[13px] font-bold leading-none ${
                isWork ? 'text-primary-700' : dayColor(dow, 'text-ink-muted')
              }`}>{day}</span>
              {isWork && (
                <>
                  <span className="text-[10px] font-bold text-primary-700 bg-primary-100 rounded px-1 py-0.5 leading-tight truncate">
                    {dayShifts[0].shiftName}
                  </span>
                  <span className="text-[11px] font-semibold text-primary-600 mt-auto leading-tight">
                    {hhmm(dayShifts[0].startTime)}
                  </span>
                  {dayShifts.length > 1 && (
                    <span className="text-[10px] text-primary-600 leading-tight">+{dayShifts.length - 1}</span>
                  )}
                </>
              )}
            </>
          )
          const baseCls = `rounded-xl p-1.5 min-h-[64px] flex flex-col gap-0.5 items-stretch text-left ${
            isWork ? 'bg-primary-50 border border-primary-200' : 'bg-canvas-soft/50 border border-transparent'
          } ${isToday ? 'ring-2 ring-primary-600 ring-offset-1' : ''} ${isSelected ? 'border-primary-700 bg-primary-100' : ''}`
          return isWork ? (
            <button key={i} onClick={() => onSelectDate(dateStr)} className={`${baseCls} cursor-pointer transition`}>
              {inner}
            </button>
          ) : (
            <div key={i} className={baseCls}>{inner}</div>
          )
        })}
      </div>
      <p className="m-0 mt-2 text-[11px] text-ink-faint text-center">근무일을 누르면 상세 시간이 표시됩니다</p>
    </div>
  )
}

// ── 선택한 날짜 상세 ──────────────────────────────────────────────────────────

function DayDetail({ dateStr, entries, allShifts }: {
  dateStr: string
  entries: StaffDayDetail[]
  allShifts: MyShift[]
}) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  return (
    <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-3.5">
      <p className="m-0 mb-2 text-[14px] font-extrabold text-ink">
        {d.getMonth() + 1}월 {d.getDate()}일 <span className={dayColor(day)}>({DAY_NAMES[day]})</span>
      </p>
      {entries.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-muted">근무 정보가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => {
            // 휴게시간 정보는 getMyRoster 데이터에만 있어 시간대가 일치하는 항목에서 보충
            const match = allShifts.find(s => s.work_date === dateStr && hhmm(s.start_time) === hhmm(e.startTime))
            return (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 shrink-0">{e.shiftName}</span>
                <span className="text-[15px] font-bold text-ink flex-1">{hhmm(e.startTime)} ~ {hhmm(e.endTime)}</span>
                <span className="text-[13px] text-ink-muted text-right shrink-0">
                  {match && match.breakMinutes > 0
                    ? `휴게 ${formatBreakMinutes(match.breakMinutes)} · 실 ${match.netHours}h`
                    : `${e.hours}시간`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
