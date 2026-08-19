import type { RosterAssignment } from '@/types/database'
import type { RosterUnit } from '@/app/actions/roster'

// 시프트 이름 고정 우선순위: 오전 → 오후 → 기타
export const shiftNamePriority = (name: string) => name === '오전' ? 0 : name === '오후' ? 1 : 2

export const ASSIGNMENT_COLUMNS = 'id, work_date, shift_id, staff_id, staff_role, popup_id, start_time, end_time, break_minutes, created_at, staff_profiles (id, name, phone, status)'
export const SNAPSHOT_COLUMNS = 'work_date, shift_id, staff_id, staff_role, popup_id, start_time, end_time'

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

export const DEFAULT_SHIFTS = [
  { name: '오전', start_time: '06:00', end_time: '15:00', weekday_required: 2, weekend_required: 2, sort_order: 0 },
  { name: '오후', start_time: '15:00', end_time: '22:00', weekday_required: 2, weekend_required: 2, sort_order: 1 },
]
