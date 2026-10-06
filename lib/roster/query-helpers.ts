import type { RosterAssignment } from '@/types/database'
import type { RosterUnit } from '@/app/actions/roster'
import { hhmmToMinutes, resolveBreakMinutes } from '@/lib/workhours'

// 파트 정렬 기준은 이름(오전/오후)이 아니라 시작 시각 — 하루를 00:00~24:00 한 축으로 보고
// 이른 시간대가 먼저 온다. 자정을 넘겨 시작하는 파트도 시작 시각 그대로 줄 세우면 된다.
export const shiftStartPriority = (startTime: string | null | undefined) =>
  startTime ? hhmmToMinutes(startTime) : Number.MAX_SAFE_INTEGER

export const ASSIGNMENT_COLUMNS = 'id, work_date, shift_id, staff_id, staff_role, popup_id, start_time, end_time, break_minutes, created_at, staff_profiles (id, name, phone, status)'
// 되돌리기 스냅샷에 break_minutes가 빠져 있어, 초기화·일괄 해제를 되돌리면 그 근무일에만 걸어둔
// 휴게 오버라이드(예: 휴게 미포함)가 조용히 사라지고 급여가 달라졌다. 복원에 필요한 필드는 모두 담는다.
export const SNAPSHOT_COLUMNS = 'work_date, shift_id, staff_id, staff_role, popup_id, start_time, end_time, break_minutes'

/**
 * 파트의 시간·휴게를 그 근무일의 확정값으로 굳힌다 — 근로내역이 파트 행에 의존하지 않게 하는 핵심.
 * 휴게는 lib/workhours.ts resolveBreakMinutes와 같은 우선순위(파트값 > 기본 60)를 쓴다.
 * roster_shifts.break_minutes는 NOT NULL DEFAULT 0이라 0은 "휴게 없음"이 아니라 "미설정"을 뜻하므로,
 * 그대로 복사하지 말고 반드시 기본값으로 넘겨야 한다 (복사하면 유급 시간이 하루 1시간씩 늘어난다).
 */
export function materializeFromShift(shift: { start_time: string; end_time: string; break_minutes: number }) {
  return {
    start_time: shift.start_time,
    end_time: shift.end_time,
    break_minutes: resolveBreakMinutes(null, shift.break_minutes),
  }
}

// 캐셔 달력의 "전체" 보기 — 실제 popup_id로 쓰이지 않는 센티널이라 음수로 고정.
// 조회에만 쓰인다: applyUnitFilter가 popup_id 조건 자체를 생략해 staff_role만으로 걸러 모든 팝업을 합쳐 보여준다.
// 새 파트 생성처럼 popup_id를 실제로 써서 insert하는 동작은 이 값을 만나면 반드시 막아야 한다(isAllPopups로 방어).
export const ALL_POPUPS = -1
export const isAllPopups = (unit: RosterUnit) => unit.popupId === ALL_POPUPS

// staff_profiles 중첩 조인 select의 반환 타입이 제네릭 추론과 안 맞아 단언이 필요 — 한 곳에만 모아둔다
export const castAssignment = (row: unknown): RosterAssignment => row as RosterAssignment
export const castAssignments = (rows: unknown[] | null): RosterAssignment[] => (rows ?? []) as RosterAssignment[]

// supabase 쿼리 빌더 제네릭을 그대로 제약하면 타입 추론이 폭발(TS2589)해서 내부만 느슨하게 처리
interface UnitFilterable { eq(column: string, value: unknown): unknown; is(column: string, value: null): unknown }
export function applyUnitFilter<T>(query: T, unit: RosterUnit): T {
  const q = (query as unknown as UnitFilterable).eq('staff_role', unit.staffRole) as UnitFilterable
  if (isAllPopups(unit)) return q as T // 전체 보기 — popup_id 조건 없이 role만
  const filtered = unit.popupId === null ? q.is('popup_id', null) : q.eq('popup_id', unit.popupId)
  return filtered as T
}

// 새 팝업의 기본 파트 — 오전/오후로 미리 쪼개지 않고 하루 전체(00:00~24:00) 하나로 시작한다.
// 실제 운영 시간에 맞춰 좁히거나 여러 파트로 나누는 건 파트 관리에서 자유롭게 한다.
export const DEFAULT_SHIFTS = [
  { name: '종일', start_time: '00:00', end_time: '24:00', weekday_required: 1, weekend_required: 1, sort_order: 0 },
]
