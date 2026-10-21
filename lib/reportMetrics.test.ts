import { describe, it, expect } from 'vitest'
import {
  buildWeeklySummary, splitWeekdayWeekend, buildMenuPareto, computeRevenueStats, trimHourlyRange,
  findPeakHours, findNoSalesDates, buildReportInsights,
  type ReportDailyInput, type ReportHourlyInput, type ReportMenuInput,
} from './reportMetrics'

// 2026-09-02는 수요일 — 주말(토·일)은 9/5, 9/6, 9/12, 9/13
const day = (date: string, revenue: number, orderCount = Math.round(revenue / 10000)): ReportDailyInput => ({ date, revenue, orderCount })

const hour = (h: number, revenue: number, orderCount = 1): ReportHourlyInput => ({ hour: h, label: `${String(h).padStart(2, '0')}시`, revenue, orderCount })

const menu = (id: number, name: string, totalRevenue: number, totalQuantity = 10): ReportMenuInput => ({ id, name, color: '#000000', totalQuantity, totalRevenue })

describe('buildWeeklySummary', () => {
  it('시작일부터 7일 단위로 묶고 마지막 주는 종료일에서 자른다', () => {
    const daily = [day('2026-09-02', 100000), day('2026-09-08', 50000), day('2026-09-09', 300000), day('2026-09-10', 0, 0)]
    const rows = buildWeeklySummary(daily, '2026-09-02', '2026-09-10')
    expect(rows.map((r) => [r.week, r.startDate, r.endDate, r.revenue])).toEqual([
      [1, '2026-09-02', '2026-09-08', 150000],
      [2, '2026-09-09', '2026-09-10', 300000],
    ])
    expect(rows[1].changePct).toBe(100)
    expect(rows[0].changePct).toBeNull()
  })

  it('판매일은 매출이 있던 날만 세고, 아직 오지 않은 뒤쪽 주는 뺀다', () => {
    const rows = buildWeeklySummary([day('2026-09-02', 100000), day('2026-09-03', 0, 0)], '2026-09-02', '2026-09-30')
    expect(rows).toHaveLength(1)
    expect(rows[0].salesDays).toBe(1)
  })

  it('기간 밖 날짜는 무시한다', () => {
    const rows = buildWeeklySummary([day('2026-09-01', 999), day('2026-09-02', 100)], '2026-09-02', '2026-09-03')
    expect(rows[0].revenue).toBe(100)
  })
})

describe('splitWeekdayWeekend', () => {
  it('토·일을 주말로 묶어 일평균과 차이를 낸다', () => {
    const split = splitWeekdayWeekend([
      day('2026-09-04', 100000, 10), // 금
      day('2026-09-07', 100000, 10), // 월
      day('2026-09-05', 150000, 15), // 토
      day('2026-09-06', 150000, 15), // 일
    ])
    expect(split.weekday).toEqual({ days: 2, avgRevenue: 100000, avgOrders: 10, avgOrderValue: 10000 })
    expect(split.weekend.avgRevenue).toBe(150000)
    expect(split.weekendLiftPct).toBe(50)
  })

  it('한쪽이 비면 차이는 null', () => {
    expect(splitWeekdayWeekend([day('2026-09-04', 100000)]).weekendLiftPct).toBeNull()
  })
})

describe('buildMenuPareto', () => {
  it('매출순 누적 비중으로 A(80%까지)·B(95%까지)·C 등급을 매긴다', () => {
    const rows = buildMenuPareto([menu(1, 'c', 100), menu(2, 'a', 700), menu(3, 'b', 150), menu(4, 'd', 50), menu(5, '안팔림', 0)])
    expect(rows.map((r) => [r.name, r.share, r.cumulativeShare, r.grade])).toEqual([
      ['a', 70, 70, 'A'],
      ['b', 15, 85, 'A'], // 더하기 전 누적 70% < 80%
      ['c', 10, 95, 'B'],
      ['d', 5, 100, 'C'],
    ])
    expect(rows[0].rank).toBe(1)
  })

  it('판매가 없으면 빈 배열', () => {
    expect(buildMenuPareto([menu(1, 'x', 0)])).toEqual([])
  })

  it('평균 단가 = 매출 ÷ 수량', () => {
    expect(buildMenuPareto([menu(1, 'x', 45000, 10)])[0].avgPrice).toBe(4500)
  })
})

describe('computeRevenueStats', () => {
  it('판매일만 대상으로 평균·중앙값·변동계수를 낸다', () => {
    const stats = computeRevenueStats([day('2026-09-02', 100), day('2026-09-03', 200), day('2026-09-04', 300), day('2026-09-05', 0)])!
    expect(stats.days).toBe(3)
    expect(stats.mean).toBe(200)
    expect(stats.median).toBe(200)
    expect(stats.bins.reduce((s, b) => s + b.count, 0)).toBe(3)
    expect(stats.bins[stats.bins.length - 1].to).toBe(300)
  })

  it('짝수 개면 가운데 두 값의 평균이 중앙값', () => {
    expect(computeRevenueStats([day('2026-09-02', 100), day('2026-09-03', 300)])!.median).toBe(200)
  })

  it('모든 날이 같은 매출이어도 구간 하나에 모두 들어간다', () => {
    const stats = computeRevenueStats([day('2026-09-02', 100), day('2026-09-03', 100)])!
    expect(stats.cv).toBe(0)
    expect(stats.bins.reduce((s, b) => s + b.count, 0)).toBe(2)
  })

  it('판매일이 없으면 null', () => {
    expect(computeRevenueStats([day('2026-09-02', 0)])).toBeNull()
  })
})

describe('trimHourlyRange / findPeakHours', () => {
  const hourly = [hour(9, 0, 0), hour(10, 100), hour(11, 300), hour(12, 500), hour(13, 100), hour(14, 0, 0)]

  it('판매가 있는 첫·마지막 시간 사이만 남긴다', () => {
    expect(trimHourlyRange(hourly).map((h) => h.hour)).toEqual([10, 11, 12, 13])
    expect(trimHourlyRange([hour(9, 0, 0)])).toEqual([])
  })

  it('상위 시간과 연속 2시간 최대 구간을 찾는다', () => {
    const peak = findPeakHours(hourly)
    expect(peak.top.map((h) => h.hour)).toEqual([12, 11, 10])
    expect(peak.window).toEqual({ fromHour: 11, toHour: 13, revenue: 800, share: 80 })
  })

  it('시간이 끊긴 칸은 연속 구간으로 보지 않는다', () => {
    const peak = findPeakHours([hour(7, 500), hour(10, 500), hour(11, 10)])
    expect(peak.window).toEqual({ fromHour: 10, toHour: 12, revenue: 510, share: 50.5 })
  })
})

describe('findNoSalesDates', () => {
  it('경과일 안에서 매출이 없거나 기록이 없는 날을 찾는다', () => {
    expect(findNoSalesDates([day('2026-09-02', 100), day('2026-09-03', 0)], '2026-09-02', 4)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05'])
  })
})

describe('buildReportInsights', () => {
  const daily = [
    day('2026-09-02', 100000, 10), day('2026-09-03', 100000, 10), // 수 목
    day('2026-09-05', 200000, 20), day('2026-09-06', 200000, 20), // 토 일
    day('2026-09-07', 0, 0),
  ]
  const base = {
    daily,
    hourly: [hour(12, 100), hour(13, 900), hour(14, 800), hour(15, 100)],
    menus: [menu(1, '아메리카노', 500), menu(2, '라떼', 300), menu(3, '쿠키', 150), menu(4, '스콘', 50)],
    startDate: '2026-09-02',
    elapsedDays: 6,
    status: '진행중' as const,
    projectedTotal: 1000000,
    totalRevenue: 600000,
  }

  it('데이터가 충분한 규칙만 문장으로 만든다', () => {
    const text = buildReportInsights(base).map((i) => i.before + i.emphasis + i.after)
    expect(text[0]).toContain('주말 일평균 매출이 주중보다 200% 높습니다') // 9/7(월) 매출 0도 주중 평균에 들어간다 — 화면 요일별 평균과 같은 기준
    expect(text[1]).toContain('13~15시')
    expect(text[2]).toContain('95%') // 상위 3개
    expect(text.some((t) => t.includes('판매가 없던 날이 2일'))).toBe(true) // 9/4 기록 없음 + 9/7 매출 0
    expect(text.some((t) => t.includes('₩1,000,000'))).toBe(true)
  })

  it('최대 개수를 넘지 않고, 종료된 팝업은 예상 매출 문장을 넣지 않는다', () => {
    expect(buildReportInsights(base, 2)).toHaveLength(2)
    const done = buildReportInsights({ ...base, status: '종료', projectedTotal: null })
    expect(done.some((i) => i.emphasis.startsWith('₩'))).toBe(false)
  })

  it('빈 데이터면 빈 배열', () => {
    expect(buildReportInsights({ ...base, daily: [], hourly: [], menus: [], elapsedDays: 0, projectedTotal: null })).toEqual([])
  })
})
