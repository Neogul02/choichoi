import { cookies } from 'next/headers'
import { fetchMenuItems } from '@/app/actions/menu'
import { fetchTodaysOrdersWithItems, fetchTodaysSales } from '@/app/actions/orders'
import PosPageClient from './PosPageClient'

// 쿠키의 popupId(password-gate가 저장)로 메뉴·오늘 매출·최근 주문을 서버에서 병렬 프리페치.
// 쿠키가 없으면(구버전 로그인 세션) 클라이언트 조회로 폴백한다.
export default async function PosPage() {
  const popupId = (await cookies()).get('choichoi_popup_id')?.value ?? null

  if (!popupId) {
    return <PosPageClient initialPopupId={null} initialMenu={null} initialSales={null} initialOrders={null} />
  }

  const [menuRes, salesRes, ordersRes] = await Promise.all([
    fetchMenuItems(),
    fetchTodaysSales(popupId),
    fetchTodaysOrdersWithItems(10, popupId),
  ])

  return (
    <PosPageClient
      initialPopupId={popupId}
      initialMenu={menuRes.success ? menuRes.data ?? [] : null}
      initialSales={salesRes.success ? salesRes.data ?? { totalRevenue: 0, totalOrders: 0 } : null}
      initialOrders={ordersRes.success ? ordersRes.data ?? [] : null}
    />
  )
}
