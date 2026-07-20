import { cookies } from 'next/headers';
import { fetchPendingOrders } from '@/app/actions/orders';
import OrdersPageClient from './OrdersPageClient';

// 쿠키의 popupId(password-gate가 저장)로 미처리 주문을 서버에서 프리페치.
// 쿠키가 없으면(구버전 로그인 세션) 클라이언트 조회로 폴백한다.
export default async function OrdersPage() {
  const popupId = (await cookies()).get('choichoi_popup_id')?.value ?? null;

  if (!popupId) {
    return <OrdersPageClient initialPopupId={null} initialOrders={null} />;
  }

  const res = await fetchPendingOrders(popupId);
  return <OrdersPageClient initialPopupId={popupId} initialOrders={res.success ? res.data ?? [] : null} />;
}
