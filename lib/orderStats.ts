// 마이페이지 "내 판매 통계" 버킷팅 — 순수 함수. 서버 액션(getMyOrderStats)이 DB 합산 행을 넣어 부른다.

export interface DailyOrderStat {
  date: string
  orders: number
  revenue: number
}

export interface PopupOrderStat {
  popupId: number
  popupName: string
  orders: number
  revenue: number
  daily: DailyOrderStat[]
  byPaymentMethod: Record<string, { orders: number; revenue: number }>
}

export interface MyOrderStats {
  totalOrders: number
  totalRevenue: number
  byPopup: PopupOrderStat[]
}

/** (KST 날짜, 팝업, 결제수단) 단위 합산 행 — get_cashier_order_stats RPC 한 행 */
export interface OrderStatRow {
  date: string
  popupId: number | null
  paymentMethod: string | null
  orders: number
  revenue: number
}

export interface PopupPeriod {
  id: number
  name: string
  start_date: string
  end_date: string
}

const emptyBucket = (popupId: number, popupName: string): PopupOrderStat => ({
  popupId, popupName, orders: 0, revenue: 0, daily: [], byPaymentMethod: {},
})

/**
 * 팝업 id가 있으면 그 팝업으로, 없으면(팝업 도입 전 주문) 날짜가 걸친 팝업으로, 그래도 없거나 팝업이 지워졌으면
 * '미분류'로 담는다. 팝업 순서는 popups(시작일 순), 미분류는 맨 뒤.
 */
export function bucketOrderStats(rows: OrderStatRow[], popups: PopupPeriod[]): MyOrderStats {
  const buckets = new Map<number, PopupOrderStat>(popups.map(p => [p.id, emptyBucket(p.id, p.name)]))
  const unclassified = emptyBucket(0, '미분류')
  const daily = new Map<PopupOrderStat, Map<string, DailyOrderStat>>()
  let totalOrders = 0
  let totalRevenue = 0

  for (const r of rows) {
    const popupId = r.popupId || popups.find(p => r.date >= p.start_date && r.date <= p.end_date)?.id || 0
    const target = (popupId !== 0 && buckets.get(popupId)) || unclassified

    target.orders += r.orders
    target.revenue += r.revenue
    totalOrders += r.orders
    totalRevenue += r.revenue

    const m = r.paymentMethod ?? '기타'
    const pm = (target.byPaymentMethod[m] ??= { orders: 0, revenue: 0 })
    pm.orders += r.orders
    pm.revenue += r.revenue

    let dates = daily.get(target)
    if (!dates) daily.set(target, (dates = new Map()))
    const d = dates.get(r.date) ?? { date: r.date, orders: 0, revenue: 0 }
    d.orders += r.orders
    d.revenue += r.revenue
    dates.set(r.date, d)
  }

  for (const [bucket, dates] of daily) bucket.daily = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalOrders,
    totalRevenue,
    byPopup: [...[...buckets.values()].filter(b => b.orders > 0), ...(unclassified.orders > 0 ? [unclassified] : [])],
  }
}
