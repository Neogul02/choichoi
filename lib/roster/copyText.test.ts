import { describe, it, expect } from 'vitest'
import { shiftCopyLine, assignmentCopyLine } from './copyText'

const shift = { start_time: '10:00', end_time: '18:00', break_minutes: 60 }
const person = (o: Partial<{ start_time: string | null; end_time: string | null; break_minutes: number | null }> = {}) =>
  ({ start_time: null, end_time: null, break_minutes: null, staff_profiles: { name: '정하나' }, ...o })

describe('근무 안내 복사 줄', () => {
  it('파트 줄에 기본 휴게를 적는다', () => {
    expect(shiftCopyLine('오전', shift)).toBe('[오전] 10:00~18:00 · 휴게 1시간')
    expect(shiftCopyLine('오후', { ...shift, break_minutes: 30 })).toBe('[오후] 10:00~18:00 · 휴게 30분')
  })
  it('파트와 같으면 이름만', () => {
    expect(assignmentCopyLine(person(), shift)).toBe('· 정하나')
    expect(assignmentCopyLine(person({ start_time: '10:00', end_time: '18:00', break_minutes: 60 }), shift)).toBe('· 정하나')
  })
  it('다른 시간·휴게는 괄호에 함께 적는다', () => {
    expect(assignmentCopyLine(person({ start_time: '15:00', end_time: '18:30', break_minutes: 0 }), shift)).toBe('· 정하나 (15:00~18:30, 휴게 없음)')
    expect(assignmentCopyLine(person({ break_minutes: 30 }), shift)).toBe('· 정하나 (휴게 30분)')
    expect(assignmentCopyLine(person({ break_minutes: 90 }), shift)).toBe('· 정하나 (휴게 1시간 30분)')
  })
})
