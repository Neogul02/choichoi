'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTimeRange } from '@/lib/workhours';
import { getMyStaffProfile, type StaffPickerItem } from '@/app/actions/staff'
import { fetchStaffMonthlyDetail, fetchStaffPayEstimateInfo, type StaffDayDetail, type StaffPayEstimateInfo } from '@/app/actions/payroll'
import { minutesToHours } from '@/lib/workhours'
import { estimatePay } from '@/lib/payroll-deductions'
import { formatBreakMinutes } from '@/lib/utils'
import { DAY_NAMES } from '@/lib/staffing'
import { showMsg } from '@/lib/toast'
import NavBar from '@/components/NavBar'

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function hhmm(t: string) { return t.slice(0, 5) }
function dayColor(day: number, fallback = 'text-ink-muted') {
  return day === 0 ? 'text-red-500' : day === 6 ? 'text-blue-500' : fallback
}
function won(n: number) { return `${n.toLocaleString('ko-KR')}원` }

// 서버 컴포넌트(app/schedule/page.tsx)가 프리페치한 초기 데이터 — null이면 기존 클라이언트 조회로 폴백
export interface InitialSchedule {
  staffId: number | null
  staffName: string
  details: StaffDayDetail[]
  payInfo: StaffPayEstimateInfo | null
  cursor: { y: number; m: number }
}

// 근무자가 자기 근무 일정을 보는 화면 — nav의 "스케줄" 탭.
// MY 페이지 안 탭으로 있었지만(2026-08-24) 가장 자주 보는 화면이라 다시 nav로 끌어올렸다.
// 2026-10-31 출퇴근을 출근부로 찍게 되면서 "다음 근무·예정 근무"를 빼고 이달 예상 급여를 보여준다.
export default function ScheduleClient({ initial, staffPicker }: { initial: InitialSchedule | null; staffPicker: StaffPickerItem[] | null }) {
  // 관리자/매니저는 본인 근무 기록이 없어도 다른 직원의 스케줄을 조회할 수 있어야 하므로
  // "내 staffId"(ownStaffId, 고정)와 "현재 화면에 보이는 staffId"(viewingId)를 분리한다
  const [ownStaffId, setOwnStaffId] = useState<number | null>(initial?.staffId ?? null)
  const [viewingId, setViewingId] = useState<number | null>(initial?.staffId ?? null)
  const [staffName, setStaffName] = useState(initial?.staffName ?? '')
  const [loaded, setLoaded] = useState(initial != null)
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(initial?.cursor ?? null)
  const [details, setDetails] = useState<StaffDayDetail[]>(initial?.details ?? [])
  const [isLoading, setIsLoading] = useState(false)
  const [payInfo, setPayInfo] = useState<StaffPayEstimateInfo | null>(initial?.payInfo ?? null)
  // 프리페치된 첫 달은 상세 재조회를 건너뛴다
  const skipFirstDetailRef = useRef(initial != null && initial.staffId != null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const canPickStaff = (staffPicker?.length ?? 0) > 0

  const today = todayStr()

  // 일별 상세(달력·기본급)와 급여 정보(시급·조정 항목·기본 공제)를 함께 불러온다
  const loadMonth = useCallback(async (targetId: number, y: number, m: number) => {
    const [detailRes, payRes] = await Promise.all([
      fetchStaffMonthlyDetail(targetId, y, m),
      fetchStaffPayEstimateInfo(targetId, y, m),
    ])
    // 조회 실패를 조용히 넘기면 "근무 정보 없음" 화면과 구분되지 않는다 —
    // 실제로 서버 오류를 배정이 없는 것으로 오해해 문의가 들어온 적이 있다
    if (!detailRes.success) showMsg(`근무 일정을 불러오지 못했습니다: ${detailRes.error}`)
    setDetails(detailRes.success && detailRes.data ? detailRes.data : [])
    setPayInfo(payRes.success && payRes.data ? payRes.data : null)
  }, [])

  useEffect(() => {
    if (initial != null) return // 서버 프리페치 성공 시 마운트 조회 생략
    const now = new Date()
    setCursor({ y: now.getFullYear(), m: now.getMonth() })
    getMyStaffProfile().then(profileRes => {
      if (profileRes.success && profileRes.data) {
        setOwnStaffId(profileRes.data.id)
        setViewingId(profileRes.data.id)
        setStaffName(profileRes.data.name)
      }
      if (!profileRes.success) showMsg(`근무 일정을 불러오지 못했습니다: ${profileRes.error}`)
      setLoaded(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cursor || !viewingId) return
    if (skipFirstDetailRef.current) { skipFirstDetailRef.current = false; return }
    setIsLoading(true)
    setSelectedDate(null)
    loadMonth(viewingId, cursor.y, cursor.m).then(() => setIsLoading(false))
  }, [cursor, viewingId, loadMonth])

  // 앱 복귀/탭 전환 시 최신 스케줄로 갱신 — 관리자가 배정을 바꾸거나 퇴근을 찍어도 새로고침 없이 반영.
  // 30초 이내 재포커스는 건너뛴다(문자 확인하러 잠깐 탭 전환했다 돌아오는 등 빈번한 재조회 방지).
  const lastFocusRefetchAtRef = useRef(0)
  const FOCUS_REFETCH_MIN_INTERVAL_MS = 30_000
  useEffect(() => {
    const onFocus = () => {
      if (!viewingId) return
      const now = Date.now()
      if (now - lastFocusRefetchAtRef.current < FOCUS_REFETCH_MIN_INTERVAL_MS) return
      lastFocusRefetchAtRef.current = now
      if (cursor) loadMonth(viewingId, cursor.y, cursor.m)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [viewingId, cursor, loadMonth])

  const handlePickStaff = useCallback((id: number, name: string) => {
    if (id === viewingId) return
    // 아래에서 상세를 직접 조회하므로, viewingId 변경으로 뒤따라 돌아가는 상세 재조회 effect는 건너뛴다
    skipFirstDetailRef.current = true
    setViewingId(id)
    setStaffName(name)
    setSelectedDate(null)
    if (!cursor) return
    setIsLoading(true)
    loadMonth(id, cursor.y, cursor.m).then(() => setIsLoading(false))
  }, [viewingId, cursor, loadMonth])

  const prevMonth = () => setCursor(c => c ? (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }) : c)
  const nextMonth = () => setCursor(c => c ? (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }) : c)
  const goToday = () => { const now = new Date(); setCursor({ y: now.getFullYear(), m: now.getMonth() }) }

  const totalDays = new Set(details.map(d => d.date)).size

  // 총 시간은 유급 "분"을 전부 합산한 뒤 마지막에 한 번만 반올림 — 급여정산(fetchMonthlyPayroll)과 동일 기준
  const totalHours = minutesToHours(details.reduce((s, d) => s + d.paidMinutes, 0))

  if (!loaded || !cursor) {
    return <Shell><p className="text-ink-faint text-sm text-center py-10">불러오는 중...</p></Shell>
  }

  if (!viewingId) {
    // 관리자/매니저는 본인 근무 기록이 없어도 선택기를 바로 띄운다 — "할 게 없는 빈 화면" 대신 다른 직원 조회로 안내
    if (canPickStaff) {
      return (
        <Shell>
          <div className="space-y-4">
            <StaffPicker staffPicker={staffPicker!} ownStaffId={ownStaffId} viewingId={viewingId} onPick={handlePickStaff} />
            <p className="m-0 text-[14px] text-ink-muted">조회할 직원을 선택하세요.</p>
          </div>
        </Shell>
      )
    }
    return (
      <Shell>
        <div className="text-center py-10">
          <p className="text-[16px] font-bold text-ink mb-2">아직 등록된 근무 정보가 없습니다</p>
          <p className="text-[14px] text-ink-muted">관리자에게 문의해 주세요.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
    <div className="space-y-4 lg:space-y-5">

      <h2 className="m-0 text-title text-ink">{staffName}님의 근무 일정</h2>

      {canPickStaff && (
        <StaffPicker staffPicker={staffPicker!} ownStaffId={ownStaffId} viewingId={viewingId} onPick={handlePickStaff} />
      )}

      {/* 데스크톱에서는 예상 급여를 좌측 컬럼, 월 달력을 우측 컬럼에 나란히 배치 */}
      <div className="space-y-4 lg:space-y-5 lg:grid lg:grid-cols-[340px_1fr] lg:gap-5 lg:items-start">

      <PayEstimateCard month={cursor.m} details={details} payInfo={payInfo} isLoading={isLoading} />

      {/* 월 달력 */}
      <section className="bg-canvas rounded-2xl border border-hairline shadow-level-1 p-4 lg:p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="m-0 text-title text-ink">{cursor.y}년 {cursor.m + 1}월</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={prevMonth} aria-label="이전 달" className="w-9 h-9 rounded-xl bg-canvas-soft border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-base flex items-center justify-center">‹</button>
            <button onClick={goToday} className="px-3 h-9 rounded-xl bg-canvas-soft border border-hairline text-caption font-semibold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition">이번달</button>
            <button onClick={nextMonth} aria-label="다음 달" className="w-9 h-9 rounded-xl bg-canvas-soft border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-base flex items-center justify-center">›</button>
          </div>
        </div>
        <p className="m-0 mb-3 text-caption text-ink-muted">
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
              />
            )}
          </>
        )}
        {isLoading && (
          <div className="grid grid-cols-7 gap-1 animate-pulse">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-gray-100" />
            ))}
          </div>
        )}
      </section>

      </div>

    </div>
    </Shell>
  )
}

// 로딩·빈 상태·본문이 모두 같은 틀 안에서 그려지도록 셸을 하나로 둔다 —
// MY 페이지 탭이었을 때는 MY 페이지가 NavBar와 main을 줬다.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="min-h-screen p-4 pb-10">
        <div className="max-w-[560px] lg:max-w-[900px] mx-auto">{children}</div>
      </main>
    </>
  )
}

// ── 직원 선택기 (관리자/매니저 전용) ──────────────────────────────────────────

function StaffPicker({ staffPicker, ownStaffId, viewingId, onPick }: {
  staffPicker: StaffPickerItem[]
  ownStaffId: number | null
  viewingId: number | null
  onPick: (id: number, name: string) => void
}) {
  const ownName = ownStaffId != null ? staffPicker.find(s => s.id === ownStaffId)?.name ?? null : null
  const kitchen = staffPicker.filter(s => s.staff_role === 'kitchen' && s.id !== ownStaffId)
  const cashier = staffPicker.filter(s => s.staff_role === 'cashier' && s.id !== ownStaffId)

  return (
    <section className="bg-canvas rounded-2xl border border-hairline shadow-level-1 p-4">
      <label className="block mb-2 text-[13px] font-bold text-ink-muted">직원 선택 (관리자 전용)</label>
      <select
        value={viewingId ?? ''}
        onChange={e => {
          const id = Number(e.target.value)
          const picked = staffPicker.find(s => s.id === id)
          onPick(id, picked?.name ?? (id === ownStaffId ? (ownName ?? '나') : ''))
        }}
        className="w-full border border-hairline rounded-xl px-3 py-2.5 text-[14px] font-semibold bg-canvas-soft text-ink outline-none focus:border-primary-700"
      >
        {viewingId == null && <option value="" disabled>직원을 선택하세요</option>}
        {ownStaffId != null && <option value={ownStaffId}>내 스케줄{ownName ? ` (${ownName})` : ''}</option>}
        {kitchen.length > 0 && (
          <optgroup label="주방">
            {kitchen.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        )}
        {cashier.length > 0 && (
          <optgroup label="캐셔">
            {cashier.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        )}
      </select>
    </section>
  )
}

// ── 이달 예상 급여 ─────────────────────────────────────────────────────────────
// 급여정산 상세(PayrollDetailModal)와 같은 식: 유급 시간 × 시급 = 기본급, 여기에 그 달 조정 항목을 더한다.
// 출근부로 퇴근을 찍으면 그날 배정이 실측 시간으로 바뀌므로, 이 금액은 찍힌 근무를 따라간다.

function PayEstimateCard({ month, details, payInfo, isLoading }: {
  month: number
  details: StaffDayDetail[]
  payInfo: StaffPayEstimateInfo | null
  isLoading: boolean
}) {
  const rawSum = details.reduce((s, d) => s + d.rawMinutes, 0)
  const breakSum = details.reduce((s, d) => s + d.breakMinutes, 0)
  const totalHours = minutesToHours(details.reduce((s, d) => s + d.paidMinutes, 0))
  const hourlyRate = payInfo?.hourlyRate ?? null
  const basePay = hourlyRate != null ? Math.round(totalHours * hourlyRate) : null
  const estimate = basePay != null ? estimatePay(basePay, payInfo?.adjustments ?? [], payInfo?.defaultDeduction ?? null) : null

  return (
    <section className="rounded-2xl bg-primary-700 text-white p-5 shadow-level-1">
      <p className="m-0 text-[12px] font-bold opacity-70">{month + 1}월 예상 급여</p>
      {isLoading ? (
        <p className="m-0 mt-2 text-[15px] opacity-70">불러오는 중...</p>
      ) : estimate == null ? (
        <>
          <p className="m-0 mt-2 text-title">시급이 등록되지 않았어요</p>
          <p className="m-0 mt-1 text-caption opacity-70">관리자에게 문의해 주세요.</p>
        </>
      ) : (
        <>
          <p className="m-0 mt-1.5 text-[32px] font-extrabold leading-tight tracking-tight">{won(estimate.finalPay)}</p>
          <div className="mt-4 pt-3 border-t border-white/15 space-y-1.5 text-[13px]">
            <Line label="실근무 − 휴게" value={`${minutesToHours(rawSum)}h − ${minutesToHours(breakSum)}h = ${totalHours}h`} />
            <Line label={`기본급 (${totalHours}h × ${won(hourlyRate!)})`} value={won(basePay!)} />
            {estimate.lines.map((l, i) => (
              <Line
                key={i}
                label={l.estimated ? `${l.label} (예상)` : l.label}
                value={`${l.amount >= 0 ? '+' : '−'}${won(Math.abs(l.amount))}`}
              />
            ))}
          </div>
          <p className="m-0 mt-3 text-[11px] leading-snug opacity-60">
            출퇴근 기록 기준 예상 금액이에요. 확정 금액은 관리자 정산 후 정해져요.
          </p>
        </>
      )}
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="opacity-75 min-w-0">{label}</span>
      <span className="font-bold shrink-0 tabular-nums">{value}</span>
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
              <span className={`text-[13px] lg:text-[14px] font-bold leading-none ${
                isWork ? 'text-primary-700' : dayColor(dow, 'text-ink-muted')
              }`}>{day}</span>
              {isWork && (
                <>
                  <span className="text-[10px] lg:text-[11px] font-bold text-primary-700 bg-primary-100 rounded px-1 py-0.5 leading-tight truncate">
                    {dayShifts[0].shiftName}
                  </span>
                  <span className="text-[11px] lg:text-[12px] font-semibold text-primary-600 mt-auto leading-tight">
                    {hhmm(dayShifts[0].startTime)}
                  </span>
                  {dayShifts.length > 1 && (
                    <span className="text-[10px] lg:text-[11px] text-primary-600 leading-tight">+{dayShifts.length - 1}</span>
                  )}
                </>
              )}
            </>
          )
          const baseCls = `rounded-xl p-1.5 lg:p-2 min-h-[64px] lg:min-h-[78px] flex flex-col gap-0.5 items-stretch text-left ${
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
      <p className="m-0 mt-2 text-caption text-ink-faint text-center">근무일을 누르면 상세 시간이 표시됩니다</p>
    </div>
  )
}

// ── 선택한 날짜 상세 ──────────────────────────────────────────────────────────

function DayDetail({ dateStr, entries }: {
  dateStr: string
  entries: StaffDayDetail[]
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
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 shrink-0">{e.shiftName}</span>
              <span className="text-[15px] font-bold text-ink flex-1">{formatTimeRange(e.startTime, e.endTime)}</span>
              <span className="text-[13px] text-ink-muted text-right shrink-0">
                {e.breakMinutes > 0 ? `휴게 ${formatBreakMinutes(e.breakMinutes)} · 실 ${e.hours}h` : `${e.hours}시간`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
