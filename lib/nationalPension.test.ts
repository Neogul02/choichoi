import { describe, it, expect } from 'vitest'
import { evaluatePension, pensionReportDeadline } from './nationalPension'

const base = { days: 0, hours: 0, pay: 0, workedPrevMonth: true }

describe('evaluatePension', () => {
  it('세 조건 중 하나만 충족해도 대상', () => {
    expect(evaluatePension({ ...base, hours: 60 }).status).toBe('eligible')
    expect(evaluatePension({ ...base, pay: 2_200_000 }).status).toBe('eligible')
    expect(evaluatePension({ ...base, days: 8 }).status).toBe('eligible')
  })

  it('경계 바로 아래는 대상이 아니다', () => {
    expect(evaluatePension({ days: 7, hours: 59.9, pay: 2_199_999, workedPrevMonth: true })).toEqual({ status: 'none', reasons: [] })
  })

  it('충족한 조건을 근거로 돌려준다', () => {
    expect(evaluatePension({ days: 25, hours: 180.3, pay: 2_343_900, workedPrevMonth: true }).reasons)
      .toEqual(['60시간 이상', '월 220만 원 이상', '8일 이상'])
  })

  // 그 달에 처음 온 직원(3일~29일 근무 등)은 1~3을 충족해도 그 달은 대상이 아니다
  it('전 달 근무가 없으면 조건을 채워도 첫 달', () => {
    const r = evaluatePension({ days: 9, hours: 49.5, pay: 618_750, workedPrevMonth: false })
    expect(r.status).toBe('first-month')
    expect(r.reasons).toEqual(['8일 이상'])
  })

  it('조건을 못 채우면 전 달 근무와 무관하게 대상 아님', () => {
    expect(evaluatePension({ days: 2, hours: 13, pay: 162_500, workedPrevMonth: false }).status).toBe('none')
  })
})

describe('pensionReportDeadline', () => {
  it('다음 달 15일, 12월이면 다음 해 1월', () => {
    expect(pensionReportDeadline(2026, 9)).toBe('2026-11-15')
    expect(pensionReportDeadline(2026, 11)).toBe('2027-01-15')
  })
})
