import { describe, it, expect } from 'vitest'
import { pickDayHourly, hourlyDiffersFromTotal, type DayHourRow } from './dayDetail'

const h = (hour: number, revenue: number, orders: number | null = 1): DayHourRow => ({ hour, revenue, orders })

describe('pickDayHourly', () => {
  it('시간대 수기 입력이 있으면 POS보다 우선한다', () => {
    const r = pickDayHourly([h(14, 300, null), h(11, 100, null)], [h(11, 90), h(12, 50)])
    expect(r.source).toBe('manual')
    expect(r.hourly.map(x => x.hour)).toEqual([11, 14])
  })

  it('수기 입력이 없으면 POS 시간대를 시각 순으로 쓴다', () => {
    const r = pickDayHourly([], [h(15, 10), h(10, 20)])
    expect(r.source).toBe('pos')
    expect(r.hourly.map(x => x.hour)).toEqual([10, 15])
  })

  it('둘 다 없으면 none', () => {
    expect(pickDayHourly([], [])).toEqual({ source: 'none', hourly: [] })
  })
})

describe('hourlyDiffersFromTotal', () => {
  it('시간대 합이 하루 합계(정정값)와 다르면 true', () => {
    // 11/1 대구 신세계 #2 — POS 7,566,500원 vs 전산 8,186,100원
    expect(hourlyDiffersFromTotal([h(11, 7_000_000), h(12, 566_500)], 8_186_100)).toBe(true)
  })
  it('같거나 시간대가 없으면 false', () => {
    expect(hourlyDiffersFromTotal([h(11, 100), h(12, 50)], 150)).toBe(false)
    expect(hourlyDiffersFromTotal([], 150)).toBe(false)
  })
})
