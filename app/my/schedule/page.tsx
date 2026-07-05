'use client'

import { useEffect, useState } from 'react'
import NavBar from '@/components/NavBar'
import { getMyStaffProfile } from '@/app/actions/staff'
import { fetchStaffMonthlyDetail, type StaffDayDetail } from '@/app/actions/payroll'
import { getMyRoster, type MyShift } from '@/app/actions/roster'
import { CalendarGrid } from '@/app/(admin)/hr/_components/StaffCalendarModal'
import { formatBreakMinutes } from '@/lib/utils'
import type { StaffProfile } from '@/types/database'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MySchedulePage() {
  const [staffId, setStaffId] = useState<number | null>(null)
  const [staffName, setStaffName] = useState('')
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null)
  const [details, setDetails] = useState<StaffDayDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [upcomingShifts, setUpcomingShifts] = useState<MyShift[]>([])
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const now = new Date()
    setCursor({ y: now.getFullYear(), m: now.getMonth() })
    const today = todayStr()
    Promise.all([getMyStaffProfile(), getMyRoster()]).then(([profileRes, rosterRes]) => {
      if (profileRes.success && profileRes.data) {
        setStaffId(profileRes.data.id)
        setStaffName(profileRes.data.name)
        setStaffProfile(profileRes.data)
      }
      if (rosterRes.success && rosterRes.data) {
        setUpcomingShifts(rosterRes.data.shifts.filter(s => s.work_date >= today))
      }
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!cursor || !staffId) return
    setIsLoading(true)
    fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m).then(res => {
      if (res.success && res.data) setDetails(res.data)
      else setDetails([])
      setIsLoading(false)
    })
  }, [cursor, staffId])

  const prevMonth = () => setCursor(c => c ? (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }) : c)
  const nextMonth = () => setCursor(c => c ? (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }) : c)
  const goToday = () => { const now = new Date(); setCursor({ y: now.getFullYear(), m: now.getMonth() }) }

  const totalDays = new Set(details.map(d => d.date)).size
  const totalHours = details.reduce((sum, d) => sum + d.hours, 0)
  const visibleShifts = showAll ? upcomingShifts : upcomingShifts.slice(0, 10)
  const today = todayStr()

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
            <p className="text-[15px] font-bold text-ink mb-2">아직 등록된 근무 정보가 없습니다</p>
            <p className="text-[13px] text-ink-muted">관리자에게 문의해 주세요.</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-4 md:p-6">
        <div className="max-w-[900px] mx-auto space-y-4">

          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <h1 className="m-0 text-lg font-extrabold text-ink">{staffName}님의 근무 달력</h1>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-canvas-soft border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm">&lt;</button>
              <span className="text-base font-extrabold w-[110px] text-center">{cursor.y}년 {cursor.m + 1}월</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-canvas-soft border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm">&gt;</button>
              <button onClick={goToday} className="px-3 py-1.5 rounded-lg bg-canvas border border-hairline text-[12px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft transition">이번달</button>
            </div>
          </div>

          {/* 달력 */}
          <div className="bg-canvas rounded-xl border border-hairline shadow-level-1 p-4 md:p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-ink-faint text-sm">불러오는 중...</p>
              </div>
            ) : (
              <CalendarGrid year={cursor.y} month={cursor.m} details={details} />
            )}
          </div>

          {/* 월별 요약 */}
          {!isLoading && (
            <div className="flex gap-3">
              <div className="flex-1 bg-canvas rounded-xl border border-hairline shadow-level-1 p-4 text-center">
                <p className="m-0 text-[11px] font-semibold text-ink-muted mb-1">이번 달 근무일</p>
                <p className="m-0 text-[22px] font-extrabold text-ink">
                  {totalDays}<span className="text-[13px] font-semibold text-ink-muted ml-1">일</span>
                </p>
              </div>
              <div className="flex-1 bg-canvas rounded-xl border border-hairline shadow-level-1 p-4 text-center">
                <p className="m-0 text-[11px] font-semibold text-ink-muted mb-1">총 근무시간</p>
                <p className="m-0 text-[22px] font-extrabold text-ink">
                  {totalHours.toFixed(1)}<span className="text-[13px] font-semibold text-ink-muted ml-1">시간</span>
                </p>
              </div>
            </div>
          )}

          {/* 예정 근무 테이블 */}
          <div className="bg-canvas rounded-xl border border-hairline shadow-level-1 p-5">
            <h2 className="m-0 mb-4 text-[15px] font-bold text-ink">예정 근무</h2>
            {upcomingShifts.length === 0 ? (
              <p className="text-[13px] text-ink-muted">예정된 근무가 없습니다.</p>
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-hairline">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-canvas-soft border-b border-hairline">
                        <th className="text-left px-3 py-2.5 text-[12px] text-ink-muted font-semibold">날짜</th>
                        <th className="text-left px-3 py-2.5 text-[12px] text-ink-muted font-semibold">파트</th>
                        <th className="text-center px-3 py-2.5 text-[12px] text-ink-muted font-semibold">출근</th>
                        <th className="text-center px-3 py-2.5 text-[12px] text-ink-muted font-semibold">퇴근</th>
                        <th className="text-right px-3 py-2.5 text-[12px] text-ink-muted font-semibold">근무시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleShifts.map((s: MyShift, i) => {
                        const d = new Date(s.work_date + 'T00:00:00')
                        const day = d.getDay()
                        const isToday = s.work_date === today
                        return (
                          <tr
                            key={`${s.work_date}-${s.shift_name}-${s.start_time}`}
                            className={`${i > 0 ? 'border-t border-hairline' : ''} ${isToday ? 'bg-primary-50' : i % 2 === 1 ? 'bg-canvas-soft/50' : ''}`}
                          >
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="font-semibold text-ink">{d.getMonth() + 1}월 {d.getDate()}일</span>
                              <span className={`ml-1 text-[12px] ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>
                                ({DAY_NAMES[day]})
                              </span>
                              {isToday && (
                                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-700 text-white">오늘</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">{s.shift_name}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center font-medium text-ink">{s.start_time}</td>
                            <td className="px-3 py-2.5 text-center font-medium text-ink">{s.end_time}</td>
                            <td className="px-3 py-2.5 text-right text-ink-muted">
                              {s.breakMinutes > 0 ? (
                                <>
                                  <div className="text-ink font-medium">{s.hours}시간</div>
                                  <div className="text-[11px] text-ink-faint">휴게 {formatBreakMinutes(s.breakMinutes)} · 실 {s.netHours}시간</div>
                                </>
                              ) : (
                                <span>{s.hours}시간</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {upcomingShifts.length > 10 && (
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full mt-2 py-2 rounded-lg border border-hairline bg-transparent text-[12px] text-ink-muted font-semibold cursor-pointer hover:bg-canvas-soft transition-colors"
                  >
                    {showAll ? '접기' : `${upcomingShifts.length - 10}개 더 보기`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* 내 근무 설정 */}
          {staffProfile && (
            <div className="bg-canvas rounded-xl border border-hairline shadow-level-1 p-5">
              <h2 className="m-0 mb-4 text-[15px] font-bold text-ink">내 근무 설정</h2>
              <div className="space-y-2.5">
                <PrefRow
                  label="선호 요일"
                  value={staffProfile.preferred_days.length === 0
                    ? '무관'
                    : staffProfile.preferred_days.map(d => DAY_NAMES[d]).join(' · ')}
                />
                <PrefRow
                  label="최대 근무"
                  value={staffProfile.max_days_per_week != null ? `주 ${staffProfile.max_days_per_week}일` : '무제한'}
                />
                <PrefRow
                  label="4대보험"
                  value={staffProfile.wants_insurance
                    ? <span className="text-emerald-700 font-semibold">희망</span>
                    : <span className="text-ink-muted">미희망</span>}
                />
                {staffProfile.available_ranges.length > 0 && (
                  <PrefRow
                    label="가용 기간"
                    value={staffProfile.available_ranges.map((r: { from: string; to: string }) => `${r.from} ~ ${r.to}`).join(', ')}
                  />
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  )
}

function PrefRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-ink-muted w-20 shrink-0">{label}</span>
      <span className="text-[13px] text-ink">{value}</span>
    </div>
  )
}
