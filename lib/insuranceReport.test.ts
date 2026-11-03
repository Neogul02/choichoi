import { describe, it, expect } from 'vitest'
import { continuousStartDate, averageDailyHours, isDefaultReportTarget, formatResidentId, groupByRole } from './insuranceReport'

describe('continuousStartDate', () => {
  it('이번 달에 처음 왔으면 이번 달 첫 근무일', () => {
    expect(continuousStartDate(['2026-10-14', '2026-10-09'], '2026-10')).toBe('2026-10-09')
  })

  it('전 달부터 이어졌으면 이어진 첫 달의 첫 근무일', () => {
    expect(continuousStartDate(['2026-08-21', '2026-09-02', '2026-10-05', '2026-08-25'], '2026-10')).toBe('2026-08-21')
  })

  it('한 달 이상 쉬었으면 다시 온 달부터 — 공백 전 근무는 보지 않는다', () => {
    expect(continuousStartDate(['2026-07-10', '2026-09-03', '2026-10-01'], '2026-10')).toBe('2026-09-03')
  })

  it('연도를 넘어 이어져도 센다', () => {
    expect(continuousStartDate(['2025-12-20', '2026-01-05'], '2026-01')).toBe('2025-12-20')
  })

  it('보고하는 달에 근무가 없으면 null', () => {
    expect(continuousStartDate(['2026-09-01'], '2026-10')).toBeNull()
  })
})

describe('averageDailyHours', () => {
  it('0.1h 단위 반올림, 근무일 없으면 0', () => {
    expect(averageDailyHours(52, 7)).toBe(7.4)
    expect(averageDailyHours(0, 0)).toBe(0)
  })
})

describe('isDefaultReportTarget', () => {
  it('월 보수 50만 원 이하는 기본으로 빼고, 넘으면 넣는다', () => {
    expect(isDefaultReportTarget(500_000)).toBe(false)
    expect(isDefaultReportTarget(343_750)).toBe(false)
    expect(isDefaultReportTarget(500_001)).toBe(true)
    expect(isDefaultReportTarget(618_750)).toBe(true)
  })
})

describe('formatResidentId', () => {
  it('13자리는 앞 6자리 뒤에 하이픈', () => {
    expect(formatResidentId('0001011234567')).toBe('000101-1234567')
    expect(formatResidentId('000101 - 1234567')).toBe('000101-1234567')
  })
  it('없거나 13자리가 아니면 그대로', () => {
    expect(formatResidentId(null)).toBe('')
    expect(formatResidentId('AB12345')).toBe('AB12345')
  })
})

describe('groupByRole', () => {
  it('주방 먼저, 빈 묶음은 뺀다', () => {
    const rows = [{ n: 1, staffRole: 'cashier' as const }, { n: 2, staffRole: 'kitchen' as const }, { n: 3, staffRole: 'cashier' as const }]
    expect(groupByRole(rows).map(g => [g.role, g.rows.map(r => r.n)])).toEqual([['kitchen', [2]], ['cashier', [1, 3]]])
    expect(groupByRole(rows.filter(r => r.staffRole === 'cashier')).map(g => g.role)).toEqual(['cashier'])
  })
})
