import { describe, it, expect } from 'vitest'
import { appliedHourlyRate, basePayByDate, companyStandardRate, minimumRateWithHoliday, minimumWageOn, formatAppliedRates } from './wagePolicy'

describe('시급 정책', () => {
  it('2027년부터 최저임금 10,700원, 주휴 포함 12,840원', () => {
    expect(minimumWageOn('2026-12-31')).toBe(10_320)
    expect(minimumWageOn('2027-01-01')).toBe(10_700)
    expect(minimumRateWithHoliday('2027-03-01')).toBe(12_840)
  })
  it('회사 기본 시급: 2026 12,500 → 2027 13,000', () => {
    expect(companyStandardRate('2026-11-20')).toBe(12_500)
    expect(companyStandardRate('2027-01-01')).toBe(13_000)
  })
  it('2027년 근무만 13,000원 하한 — 2026년 근무는 프로필 시급 그대로, 더 높은 시급은 유지', () => {
    expect(appliedHourlyRate(12_500, '2026-12-31')).toBe(12_500)
    expect(appliedHourlyRate(12_500, '2027-01-01')).toBe(13_000)
    expect(appliedHourlyRate(12_505, '2027-01-02')).toBe(13_000)
    expect(appliedHourlyRate(14_000, '2027-01-02')).toBe(14_000)
  })
  it('한 시급 구간이면 예전 식과 같다', () => {
    const r = basePayByDate([{ date: '2026-11-01', paidMinutes: 420 }, { date: '2026-11-02', paidMinutes: 450 }], 12_500)
    expect(r.pay).toBe(Math.round(14.5 * 12_500))
    expect(r.segments).toHaveLength(1)
  })
  it('12월~1월에 걸친 팝업은 날짜별로 나눠 계산', () => {
    const r = basePayByDate([
      { date: '2026-12-30', paidMinutes: 420 }, // 7h × 12,500
      { date: '2027-01-02', paidMinutes: 420 }, // 7h × 13,000
    ], 12_500)
    expect(r.segments).toEqual([
      { rate: 12_500, hours: 7, pay: 87_500 },
      { rate: 13_000, hours: 7, pay: 91_000 },
    ])
    expect(r.pay).toBe(178_500)
    expect(formatAppliedRates(r.segments, 12_500)).toBe('12,500원→13,000원')
  })
  it('시급 미설정이면 null', () => {
    expect(basePayByDate([{ date: '2027-01-02', paidMinutes: 60 }], null).pay).toBeNull()
  })
})

import { addMinutesToHHMM } from './workhours'
describe('addMinutesToHHMM', () => {
  it('휴게 끝 시각', () => {
    expect(addMinutesToHHMM('13:00', 60)).toBe('14:00')
    expect(addMinutesToHHMM('13:00', 30)).toBe('13:30')
    expect(addMinutesToHHMM('23:30', 60)).toBe('00:30')
  })
})
