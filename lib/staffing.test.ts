import { describe, it, expect } from 'vitest'
import type { StaffProfile } from '@/types/database'
import { requiredFor, buildAssignMap, getWeekStart, checkStaffAvailability, findRosterViolations } from './staffing'

// 2026-08-02(일) ~ 2026-08-08(토) 주간을 기준으로 테스트한다
const SUN = '2026-08-02'
const MON = '2026-08-03'
const TUE = '2026-08-04'
const WED = '2026-08-05'
const THU = '2026-08-06'
const SAT = '2026-08-08'

const shift = (over: Partial<Parameters<typeof requiredFor>[1]> = {}) => ({
  id: 1,
  active_from: null,
  active_to: null,
  weekday_required: 2,
  weekend_required: 3,
  ...over,
})

describe('requiredFor', () => {
  it('활성 기간이 설정된 파트는 평일/주말 기본값을 구분한다', () => {
    const s = shift({ active_from: SUN, active_to: SAT })
    expect(requiredFor(MON, s, {})).toBe(2)
    expect(requiredFor(SUN, s, {})).toBe(3)
    expect(requiredFor(SAT, s, {})).toBe(3)
  })

  it('활성 기간을 아예 설정하지 않은 파트(무제한)는 기본값을 자동 적용하지 않는다 — override 없으면 0', () => {
    const s = shift() // active_from/active_to 모두 null
    expect(requiredFor(MON, s, {})).toBe(0)
    expect(requiredFor(SUN, s, {})).toBe(0)
    // override로 특정 날짜만 수동 배정 가능
    expect(requiredFor(MON, s, { [`${MON}|1`]: 2 })).toBe(2)
  })

  it('날짜별 예외(override)가 기본값보다 우선한다 (0도 유효)', () => {
    const s = shift({ active_from: SUN, active_to: SAT })
    expect(requiredFor(MON, s, { [`${MON}|1`]: 5 })).toBe(5)
    expect(requiredFor(SUN, s, { [`${SUN}|1`]: 0 })).toBe(0)
    // 다른 파트의 예외는 무시
    expect(requiredFor(MON, s, { [`${MON}|2`]: 5 })).toBe(2)
  })

  it('활성 기간 밖이면 0 — 경계일은 포함', () => {
    const s = shift({ active_from: MON, active_to: WED })
    expect(requiredFor(SUN, s, {})).toBe(0)
    expect(requiredFor(MON, s, {})).toBe(2)
    expect(requiredFor(WED, s, {})).toBe(2)
    expect(requiredFor(THU, s, {})).toBe(0)
  })
})

describe('getWeekStart', () => {
  it('그 날짜가 속한 주의 일요일을 반환한다', () => {
    expect(getWeekStart(SUN)).toBe(SUN)
    expect(getWeekStart(WED)).toBe(SUN)
    expect(getWeekStart(SAT)).toBe(SUN)
    expect(getWeekStart('2026-08-09')).toBe('2026-08-09') // 다음 주 일요일
  })

  it('월 경계를 넘는 주를 처리한다', () => {
    expect(getWeekStart('2026-08-01')).toBe('2026-07-26')
  })
})

describe('buildAssignMap', () => {
  it('날짜|파트 키로 그룹핑한다', () => {
    const a1 = { work_date: MON, shift_id: 1 }
    const a2 = { work_date: MON, shift_id: 1 }
    const a3 = { work_date: MON, shift_id: 2 }
    const map = buildAssignMap([a1, a2, a3])
    expect(map.get(`${MON}|1`)).toEqual([a1, a2])
    expect(map.get(`${MON}|2`)).toEqual([a3])
    expect(map.get(`${TUE}|1`)).toBeUndefined()
  })
})

const staffProfile = (over: Partial<StaffProfile> = {}): StaffProfile => ({
  id: 1,
  preferred_shift_ids: [],
  preferred_days: [],
  available_ranges: [],
  max_days_per_week: null,
  ...over,
} as StaffProfile)

describe('checkStaffAvailability', () => {
  const morning = { id: 1, name: '오전' }

  it('조건이 비어 있으면 가능', () => {
    expect(checkStaffAvailability(staffProfile(), MON, morning)).toEqual({ ok: true, reasons: [] })
  })

  it('선호 파트가 다르면 사유 추가', () => {
    const r = checkStaffAvailability(staffProfile({ preferred_shift_ids: [2] }), MON, morning)
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('다른 파트 선호')
  })

  it('선호 요일이 아니면 사유 추가', () => {
    const r = checkStaffAvailability(staffProfile({ preferred_days: [1, 2] }), SUN, morning)
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('일요일 비선호')
    expect(checkStaffAvailability(staffProfile({ preferred_days: [1, 2] }), MON, morning).ok).toBe(true)
  })

  it('가용 기간 밖이면 사유 추가 — 경계일은 포함', () => {
    const p = staffProfile({ available_ranges: [{ from: MON, to: WED }] })
    expect(checkStaffAvailability(p, SUN, morning).reasons).toContain('가용 기간 아님')
    expect(checkStaffAvailability(p, MON, morning).ok).toBe(true)
    expect(checkStaffAvailability(p, WED, morning).ok).toBe(true)
  })

  it('사유는 중첩 수집된다', () => {
    const p = staffProfile({ preferred_shift_ids: [2], preferred_days: [1] })
    expect(checkStaffAvailability(p, SUN, morning).reasons).toHaveLength(2)
  })
})

describe('findRosterViolations', () => {
  const shifts = [
    { id: 1, start_time: '06:00', end_time: '15:00' },
    { id: 2, start_time: '15:00', end_time: '23:00' },
  ]
  const assign = (id: number, date: string, shiftId: number, staffId = 1, start: string | null = null, end: string | null = null) =>
    ({ id, work_date: date, shift_id: shiftId, staff_id: staffId, start_time: start, end_time: end })

  it('전일 퇴근 후 9시간 미만 휴식이면 위반', () => {
    // 23:00 퇴근 → 다음날 06:00 출근 = 7시간 휴식
    const v = findRosterViolations([assign(1, MON, 2), assign(2, TUE, 1)], shifts, [{ id: 1, max_days_per_week: null }])
    expect(v.get(2)).toContain('전일 퇴근 후 9시간 미만 휴식')
    expect(v.has(1)).toBe(false)
  })

  it('9시간 이상 휴식이면 위반 아님', () => {
    // 15:00 퇴근 → 다음날 06:00 출근 = 15시간
    const v = findRosterViolations([assign(1, MON, 1), assign(2, TUE, 1)], shifts, [{ id: 1, max_days_per_week: null }])
    expect(v.size).toBe(0)
  })

  it('개별 시간 오버라이드를 반영한다', () => {
    // 전일 22:00 퇴근(오버라이드) → 당일 06:00 = 8시간 → 위반
    const v = findRosterViolations(
      [assign(1, MON, 1, 1, '13:00', '22:00'), assign(2, TUE, 1)],
      shifts,
      [{ id: 1, max_days_per_week: null }],
    )
    expect(v.get(2)).toContain('전일 퇴근 후 9시간 미만 휴식')
  })

  it('주(일~토) 최대 근무일을 초과하면 그 주 배정 전체에 표시', () => {
    const list = [assign(1, SUN, 1), assign(2, MON, 1), assign(3, TUE, 1), assign(4, WED, 1)]
    const v = findRosterViolations(list, shifts, [{ id: 1, max_days_per_week: 3 }])
    expect(v.get(1)).toContain('주 최대 3일 초과 (4일)')
    expect(v.get(4)).toContain('주 최대 3일 초과 (4일)')
  })

  it('최대 근무일 이내면 위반 아님, 같은 날 중복 배정은 1일로 센다', () => {
    // 월 06~15 + 15~23 연속 2파트, 다음날은 15시 출근이라 휴식 16시간 확보
    const list = [assign(1, MON, 1), assign(2, MON, 2), assign(3, TUE, 2)]
    const v = findRosterViolations(list, shifts, [{ id: 1, max_days_per_week: 2 }])
    expect(v.size).toBe(0)
  })

  it('직원별로 독립 판정한다', () => {
    const v = findRosterViolations(
      [assign(1, MON, 2, 1), assign(2, TUE, 1, 1), assign(3, MON, 2, 2)],
      shifts,
      [{ id: 1, max_days_per_week: null }, { id: 2, max_days_per_week: null }],
    )
    expect(v.get(2)).toContain('전일 퇴근 후 9시간 미만 휴식')
    expect(v.has(3)).toBe(false)
  })
})
