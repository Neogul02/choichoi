'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { fetchRosterShifts, bulkAddRosterAssignments } from '@/app/actions/roster'
import type { RosterUnit } from '@/app/actions/roster'
import type { StaffProfile, Store, RosterShift } from '@/types/database'

interface Props {
  staff: StaffProfile
  stores: Store[]
  onClose: () => void
  onAssigned: (count: number) => void
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

export default function StaffAssignModal({ staff, stores, onClose, onAssigned }: Props) {
  useBodyScrollLock()
  const unit: RosterUnit = { staffRole: staff.staff_role, storeId: staff.store_id }

  const [shifts, setShifts] = useState<RosterShift[]>([])
  const [shiftId, setShiftId] = useState<number | null>(null)

  const now = new Date()
  const todayStr = dateStr(now.getFullYear(), now.getMonth(), now.getDate())
  const [fromDate, setFromDate] = useState(todayStr)
  const [toDate, setToDate] = useState('')
  const [selectedDays, setSelectedDays] = useState<boolean[]>([true, true, true, true, true, true, true])

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    fetchRosterShifts(unit).then(res => {
      if (res.success && res.data && res.data.length > 0) {
        setShifts(res.data)
        setShiftId(res.data[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const previewDates: string[] = (() => {
    if (!fromDate || !toDate || fromDate > toDate || !shiftId) return []
    const results: string[] = []
    const cur = new Date(fromDate + 'T00:00:00')
    const end = new Date(toDate + 'T00:00:00')
    while (cur <= end) {
      if (selectedDays[cur.getDay()]) {
        results.push(dateStr(cur.getFullYear(), cur.getMonth(), cur.getDate()))
      }
      cur.setDate(cur.getDate() + 1)
    }
    return results
  })()

  const toggleDay = (i: number) => {
    setSelectedDays(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  const handleSubmit = async () => {
    if (!shiftId || previewDates.length === 0) return
    setIsSubmitting(true)
    const res = await bulkAddRosterAssignments(unit, shiftId, staff.id, previewDates)
    setIsSubmitting(false)
    if (res.success && res.data) {
      onAssigned(res.data.added)
      onClose()
    }
  }

  const selectedShift = shifts.find(s => s.id === shiftId)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[420px] rounded-xl shadow-level-2 border border-hairline overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-canvas-soft">
          <div>
            <h3 className="m-0 text-[15px] font-bold text-ink">{staff.name}</h3>
            <p className="m-0 text-[12px] text-ink-muted">근무 일정 일괄 배정</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* 파트 선택 */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">파트</label>
            {shifts.length === 0 ? (
              <p className="text-[12px] text-ink-faint">파트를 불러오는 중...</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shifts.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setShiftId(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border transition cursor-pointer ${
                      shiftId === s.id
                        ? 'bg-primary-700 text-white border-primary-700'
                        : 'bg-canvas-soft text-ink-muted border-hairline hover:border-primary-300'
                    }`}
                  >
                    {s.name}
                    <span className="ml-1 text-[10px] opacity-70">{s.start_time}~{s.end_time}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 날짜 범위 */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">기간</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700"
              />
              <span className="text-ink-faint text-[12px]">~</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={e => setToDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700"
              />
            </div>
          </div>

          {/* 요일 선택 */}
          <div>
            <label className="block text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">요일</label>
            <div className="flex gap-1">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold border transition cursor-pointer ${
                    selectedDays[i]
                      ? i === 0
                        ? 'bg-red-500 text-white border-red-500'
                        : i === 6
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-primary-700 text-white border-primary-700'
                      : 'bg-canvas-soft text-ink-faint border-hairline'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2.5 min-h-[48px]">
            {previewDates.length === 0 ? (
              <p className="text-[12px] text-ink-faint m-0">날짜와 요일을 선택하면 배정 예정 목록이 표시됩니다.</p>
            ) : (
              <>
                <p className="text-[11px] font-bold text-ink-muted m-0 mb-1">
                  배정 예정 <span className="text-primary-700">{previewDates.length}일</span>
                  {selectedShift && <span className="ml-1 text-ink-faint">· {selectedShift.name}</span>}
                </p>
                <p className="text-[11px] text-ink m-0 leading-relaxed">
                  {previewDates.map(d => {
                    const day = new Date(d + 'T00:00:00').getDay()
                    return `${d.slice(5)}(${DAY_LABELS[day]})`
                  }).join(', ')}
                </p>
              </>
            )}
          </div>

          {/* 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={previewDates.length === 0 || isSubmitting}
              className="flex-1 py-2.5 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '배정 중...' : `${previewDates.length}일 배정하기`}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-hairline bg-transparent text-[13px] text-ink-muted cursor-pointer hover:bg-canvas-soft transition"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
