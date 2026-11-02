import { describe, it, expect } from 'vitest'
import { continuousStartDate, averageDailyHours } from './insuranceReport'

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
