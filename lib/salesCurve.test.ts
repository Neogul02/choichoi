import { describe, it, expect } from 'vitest'
import { buildSalesCurve, curveKeyOf, REFERENCE_KEY, AXIS_FROM, AXIS_TO, sumUpto, mergeHourly, kstDayBounds, kstPartialHourBounds, sumUptoMinute } from './salesCurve'
import type { TodayPopupSales } from '@/types/api'

const row = (popupId: number, hourly: Array<[number, number]>): TodayPopupSales => ({
  popupId,
  popupName: `팝업${popupId}`,
  totalRevenue: hourly.reduce((s, [, v]) => s + v, 0),
  totalOrders: hourly.length,
  hourly: hourly.map(([hour, revenue]) => ({ hour, revenue })),
})

describe('buildSalesCurve — 축', () => {
  it('데이터가 없으면 기본 영업 시간대 축을 쓴다', () => {
    const c = buildSalesCurve([], null)
    expect([c.from, c.to]).toEqual([AXIS_FROM, AXIS_TO])
    expect(c.data).toHaveLength(AXIS_TO - AXIS_FROM + 1)
  })

  it('기본 축 밖 매출이 있으면 축을 넓힌다 — 조용히 잘리면 안 된다', () => {
    const c = buildSalesCurve([row(1, [[5, 1000], [23, 2000]])], null)
    expect([c.from, c.to]).toEqual([5, 23])
  })

  it('기준 곡선만 축 밖에 있어도 넓힌다', () => {
    const c = buildSalesCurve([], { hourly: [{ hour: 23, revenue: 500 }] })
    expect(c.to).toBe(23)
  })
})

describe('buildSalesCurve — 누적과 절단', () => {
  it('시간대 매출을 누적으로 바꾼다', () => {
    const c = buildSalesCurve([row(1, [[8, 1000], [9, 500], [10, 2000]])], null)
    const k = curveKeyOf(1)
    const at = (h: number) => c.data[h - c.from][k]
    expect([at(8), at(9), at(10)]).toEqual([1000, 1500, 3500])
  })

  it('마지막 매출 시각 이후는 null로 끊는다 — 남은 영업시간이 끝난 것처럼 보이면 안 된다', () => {
    const c = buildSalesCurve([row(1, [[8, 1000]])], null)
    const k = curveKeyOf(1)
    expect(c.data[8 - c.from][k]).toBe(1000)
    expect(c.data[9 - c.from][k]).toBeNull()
    expect(c.data[c.data.length - 1][k]).toBeNull()
  })

  it('기준 곡선은 오늘 곡선의 절단 시각에 끌려가지 않는다', () => {
    // 오늘은 8시까지, 어제는 20시까지 — 어제 선이 8시에서 잘리면 비교가 안 된다
    const c = buildSalesCurve([row(1, [[8, 1000]])], {
      hourly: [{ hour: 8, revenue: 900 }, { hour: 20, revenue: 100 }],
    })
    expect(c.data[9 - c.from][curveKeyOf(1)]).toBeNull()
    expect(c.data[9 - c.from][REFERENCE_KEY]).toBe(900)
    expect(c.data[20 - c.from][REFERENCE_KEY]).toBe(1000)
    expect(c.data[21 - c.from][REFERENCE_KEY]).toBeNull()
  })

  it('기준 곡선이 없으면 그 키를 아예 넣지 않는다', () => {
    const c = buildSalesCurve([row(1, [[8, 1000]])], null)
    expect(REFERENCE_KEY in c.data[0]).toBe(false)
  })
})

describe('buildSalesCurve — 선두 글로우 지점', () => {
  it('선두는 그 선의 마지막 값이 찍힌 인덱스다', () => {
    const c = buildSalesCurve([row(1, [[8, 1000], [15, 500]])], null)
    const lead = c.leadIndexByKey[curveKeyOf(1)]
    expect(lead).toBe(15 - c.from)
    // 선두 지점의 값이 정말 그 선의 마지막 non-null이어야 한다
    expect(c.data[lead][curveKeyOf(1)]).toBe(1500)
    expect(c.data[lead + 1][curveKeyOf(1)]).toBeNull()
  })

  it('여러 팝업이 같은 시각까지 그려지면 선두도 같은 인덱스다', () => {
    const c = buildSalesCurve([row(1, [[8, 1000], [12, 1]]), row(2, [[9, 2000]])], null)
    expect(c.leadIndexByKey[curveKeyOf(1)]).toBe(12 - c.from)
    expect(c.leadIndexByKey[curveKeyOf(2)]).toBe(12 - c.from)
  })

  it('매출이 0인 선에는 선두를 주지 않는다 — 0원 수평선 끝에서 반짝이면 방해만 된다', () => {
    const c = buildSalesCurve([row(1, [[8, 0]]), row(2, [[8, 100]])], null)
    expect(c.leadIndexByKey[curveKeyOf(1)]).toBeUndefined()
    expect(c.leadIndexByKey[curveKeyOf(2)]).toBe(8 - c.from)
  })

  it('매출이 아예 없으면 선두가 하나도 없다', () => {
    expect(buildSalesCurve([], null).leadIndexByKey).toEqual({})
    expect(buildSalesCurve([row(1, [])], null).leadIndexByKey).toEqual({})
  })

  it('기준 곡선도 선두를 받고, 오늘 선두와 별개로 잡힌다', () => {
    const c = buildSalesCurve([row(1, [[8, 1000]])], {
      hourly: [{ hour: 19, revenue: 700 }],
    })
    expect(c.leadIndexByKey[curveKeyOf(1)]).toBe(8 - c.from)
    expect(c.leadIndexByKey[REFERENCE_KEY]).toBe(19 - c.from)
  })

  it('모든 선두 인덱스는 data 범위 안이다', () => {
    const c = buildSalesCurve([row(1, [[5, 10], [23, 20]])], { hourly: [{ hour: 6, revenue: 5 }] })
    for (const idx of Object.values(c.leadIndexByKey)) {
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(c.data.length)
    }
  })
})

describe('비교 헬퍼', () => {
  it('sumUpto는 지정 시각까지만 더한다 — 오전에 어제 하루 전체와 맞대지 않도록', () => {
    const rows = [row(1, [[9, 100], [13, 200], [18, 400]]), row(2, [[13, 50]])]
    expect(sumUpto(rows, 13)).toBe(350)
    expect(sumUpto(rows, 8)).toBe(0)
  })

  it('mergeHourly는 팝업들을 시각별로 합치고 시간 순으로 정렬한다', () => {
    const merged = mergeHourly([row(1, [[14, 100], [9, 10]]), row(2, [[9, 5]])])
    expect(merged).toEqual([{ hour: 9, revenue: 15 }, { hour: 14, revenue: 100 }])
  })

  it('kstDayBounds는 KST 하루를 UTC로 환산한다 — 월 경계도 넘는다', () => {
    expect(kstDayBounds('2026-10-01', -1)).toEqual({
      startISO: '2026-09-29T15:00:00.000Z',
      endISO: '2026-09-30T14:59:59.999Z',
    })
  })

  it('kstPartialHourBounds는 기준일의 정각~지금 분 직전까지다', () => {
    // 오늘 10/31 14:10 → 지난주(10/24) 14:00:00 ~ 14:09:59.999 KST
    expect(kstPartialHourBounds('2026-10-31', -7, 14, 10)).toEqual({
      startISO: '2026-10-24T05:00:00.000Z',
      endISO: '2026-10-24T05:09:59.999Z',
    })
  })

  it('kstPartialHourBounds는 정각이면 볼 구간이 없다', () => {
    expect(kstPartialHourBounds('2026-10-31', -1, 14, 0)).toBeNull()
  })

  it('sumUptoMinute는 끝난 시까지 + 진행 중인 시의 분 단위 구간만 더한다', () => {
    const full = [row(1, [[9, 100], [13, 200], [14, 600]]), row(2, [[13, 50]])]
    const partial = [row(1, [[14, 120]])]
    // 14:10 기준 — 14시 전체(600)가 아니라 14:00~14:09(120)만 들어간다
    expect(sumUptoMinute(full, partial, 14)).toBe(100 + 200 + 50 + 120)
    expect(sumUptoMinute(full, [], 14)).toBe(350)
  })
})
