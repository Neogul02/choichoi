/**
 * 매출·주문 관련 React Query 키 — POS·주문 화면·통계가 같은 데이터를 같은 키로 캐시하도록 한 곳에 둔다.
 * 화면마다 문자열을 따로 쓰면 무효화(invalidate)가 한쪽만 맞고 다른 쪽은 낡은 값을 보여준다.
 * `…All`은 접두어 키 — 무효화할 때 팝업과 무관하게 전부 걸린다.
 * 사업장 단위로 나누게 되면(서비스화) 여기서 맨 앞에 사업장 id를 붙인다.
 */
export const queryKeys = {
  menuItems: ['menu-items'] as const,
  todaySalesAll: ['today-sales'] as const,
  todaySales: (popupId: string | null) => ['today-sales', popupId] as const,
  todaySalesByPopup: ['today-sales-by-popup'] as const,
  todayMenuSalesAll: ['today-menu-sales'] as const,
  todayMenuSales: (popupId: string | null) => ['today-menu-sales', popupId] as const,
  todayOrdersRecentAll: ['today-orders-recent'] as const,
  todayOrdersRecent: (popupId: string | null) => ['today-orders-recent', popupId] as const,
  pendingOrdersAll: ['pending-orders'] as const,
  pendingOrders: (popupId: string | null) => ['pending-orders', popupId] as const,
  /** 어제·지난주 같은 요일의 팝업별 시간대 매출 — 날짜가 바뀌면 키도 바뀐다 */
  salesCompareDays: (today: string) => ['sales-compare-days', today] as const,
}
