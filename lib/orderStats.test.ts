import { describe, it, expect } from 'vitest'
import { bucketOrderStats } from './orderStats'

const popups = [
  { id: 1, name: '홍대 AK', start_date: '2026-10-02', end_date: '2026-10-15' },
  { id: 2, name: '분당 AK', start_date: '2026-10-09', end_date: '2026-10-29' },
]

describe('bucketOrderStats', () => {
  it('팝업 id → 그 팝업, 없으면 날짜가 걸친 팝업, 그래도 없거나 지워진 팝업이면 미분류', () => {
    const r = bucketOrderStats([
      { date: '2026-10-10', popupId: 2, paymentMethod: 'cash', orders: 3, revenue: 27000 },
      { date: '2026-10-03', popupId: null, paymentMethod: null, orders: 1, revenue: 9000 },
      { date: '2026-09-01', popupId: null, paymentMethod: 'cash', orders: 2, revenue: 16000 },
      { date: '2026-10-11', popupId: 99, paymentMethod: 'cash', orders: 1, revenue: 8500 },
    ], popups)
    expect(r.totalOrders).toBe(7)
    expect(r.totalRevenue).toBe(60500)
    expect(r.byPopup.map(b => [b.popupName, b.orders])).toEqual([['홍대 AK', 1], ['분당 AK', 3], ['미분류', 3]])
    expect(r.byPopup[0].byPaymentMethod).toEqual({ 기타: { orders: 1, revenue: 9000 } })
    expect(r.byPopup[2].daily.map(d => d.date)).toEqual(['2026-09-01', '2026-10-11'])
  })

  it('주문이 없으면 빈 결과', () => {
    expect(bucketOrderStats([], popups)).toEqual({ totalOrders: 0, totalRevenue: 0, byPopup: [] })
  })
})
