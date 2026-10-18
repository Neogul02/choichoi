import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { MenuSalesItem } from '@/types/api'

// 서버 전용 조회 헬퍼. 예전엔 app/actions/menu.ts('use server')에서 export돼 있었는데, 'use server' 파일의
// export는 전부 브라우저에서 부를 수 있는 공개 엔드포인트가 된다 — 권한 검사 없는 이 함수로 누구나 임의 기간의
// 품목별 매출을 읽을 수 있었다. 권한은 이 함수를 부르는 액션이 거른다.

/** 메뉴별 판매 집계 — orders.ts(주문 완료 알림)·stats.ts(메뉴별 매출 화면) 공용 */
export async function getMenuSalesByPeriod(
  startISO: string,
  endISO: string,
  popupId?: string | number | null,
): Promise<MenuSalesItem[]> {
  const { data, error } = await supabaseAdmin.rpc('get_menu_sales_by_period', {
    p_start: startISO,
    p_end: endISO,
    p_popup_id: popupId && popupId !== '0' ? Number(popupId) : null,
  })

  if (error) throw error

  return (data ?? []).map(
    (row: {
      menu_item_id: number
      item_name: string
      item_price: number
      item_color: string
      total_quantity: number
      total_revenue: number
    }) => ({
      id: row.menu_item_id,
      name: row.item_name,
      price: row.item_price,
      color: row.item_color,
      totalQuantity: Number(row.total_quantity),
      totalRevenue: Number(row.total_revenue),
    }),
  )
}
