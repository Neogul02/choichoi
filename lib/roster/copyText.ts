import { formatTimeRange, resolveBreakMinutes } from '@/lib/workhours'
import { formatBreakMinutes } from '@/lib/utils'

/**
 * 근무 안내 복사(일간·주간·일정 탭) 공용 줄 만들기 — 세 곳이 같은 형식을 쓰도록 한 곳에 둔다.
 * 휴게는 급여 계산과 같은 규칙(resolveBreakMinutes)으로 정한다.
 */
type ShiftLike = { start_time: string; end_time: string; break_minutes: number | null }
type AssignmentLike = {
  start_time: string | null
  end_time: string | null
  break_minutes: number | null
  staff_profiles?: { name: string } | null
}

const breakLabel = (min: number) => (min === 0 ? '휴게 없음' : `휴게 ${formatBreakMinutes(min)}`)

/** `[오전] 10:00~18:00 · 휴게 1시간` */
export function shiftCopyLine(label: string, shift: ShiftLike): string {
  return `[${label}] ${formatTimeRange(shift.start_time, shift.end_time)} · ${breakLabel(resolveBreakMinutes(null, shift.break_minutes))}`
}

/** `· 홍길동 (15:00~18:30, 휴게 없음)` — 파트 기본과 다른 시간·휴게만 괄호에 적는다 */
export function assignmentCopyLine(a: AssignmentLike, shift: ShiftLike): string {
  const shiftBreak = resolveBreakMinutes(null, shift.break_minutes)
  const myBreak = resolveBreakMinutes(a.break_minutes, shift.break_minutes)
  const start = (a.start_time ?? shift.start_time).slice(0, 5)
  const end = (a.end_time ?? shift.end_time).slice(0, 5)
  const timeChanged = start !== shift.start_time.slice(0, 5) || end !== shift.end_time.slice(0, 5)
  const extras = [timeChanged ? `${start}~${end}` : '', myBreak !== shiftBreak ? breakLabel(myBreak) : ''].filter(Boolean)
  return `· ${a.staff_profiles?.name ?? ''}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`
}
