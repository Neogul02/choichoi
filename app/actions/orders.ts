'use server';

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { z } from 'zod';
import { wrap, extractErrorMessage } from './_base';
import {
  createOrder,
  getTodaysSales,
  getTodaysOrderList,
  getTodaysOrderListWithItems,
  getPendingOrders,
  prepareOrder,
  deleteOrder,
  getOrdersByPeriod,
  getPopupEventName,
  getKSTDateBounds,
  getMenuSalesByPeriod,
  decrementMenuStock,
} from '@/lib/supabase-admin';
import type { OrderItemInput } from '@/lib/supabase';
import type {
  ApiResponse,
  SaveOrderResponse,
  FetchTodaysSalesResponse,
  FetchOrdersResponse,
  FetchOrdersWithItemsResponse,
} from '@/types/api';

const SaveOrderSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    price: z.number().int().refine((v) => v !== 0, '가격은 0이 될 수 없습니다'),
    count: z.number().int().positive(),
  })).min(1, '주문 항목이 없습니다'),
  totalPrice: z.number().int().min(0, '총 금액이 올바르지 않습니다'),
});

export async function saveOrder(items: OrderItemInput[], totalPrice: number, cashierName?: string, popupId?: string | null): Promise<SaveOrderResponse> {
  const parsed = SaveOrderSchema.safeParse({ items, totalPrice });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  try {
    const order = await createOrder(items, totalPrice, cashierName, popupId);
    const sales = await getTodaysSales(popupId);

    try {
      // 할인 블록(음수 가격 메뉴)은 실물 재고가 없으므로 차감 대상에서 제외
      const stockItems = items.filter((i) => i.price > 0).map((i) => ({ id: i.id, count: i.count }))
      if (stockItems.length > 0) await decrementMenuStock(stockItems)
    } catch (err) {
      console.error('[saveOrder] 메뉴 재고 차감 실패:', err)
    }

    // 주문 완료 알림 (fire-and-forget)
    (async () => {
      const popupName = popupId && popupId !== '0' ? await getPopupEventName(Number(popupId)) : null;
      const { start, end } = getKSTDateBounds();
      const menuToday = await getMenuSalesByPeriod(start, end, popupId);
      const { notifyDiscord } = await import('@/lib/discord');
      await notifyDiscord('order', '🧾 주문 완료', `**${popupName ?? '팝업 미지정'}**`, [
        { name: '주문 내역', value: items.map((i) => `${i.name} x${i.count}`).join(', ') },
        { name: '이번 주문 금액', value: `₩${totalPrice.toLocaleString('ko-KR')}`, inline: true },
        { name: '금일 누적 매출', value: `₩${sales.totalRevenue.toLocaleString('ko-KR')} (${sales.totalOrders}건)`, inline: true },
        { name: '금일 메뉴별 판매', value: menuToday.map((m) => `${m.name} ${m.totalQuantity}개`).join(', ') || '-' },
      ]);
    })().catch(() => {});

    if (cashierName) {
      try {
        await supabaseAdmin.rpc('increment_worker_revenue', { p_name: cashierName, p_amount: totalPrice })
      } catch (err) {
        console.error('[saveOrder] revenue increment failed:', err)
      }
    }

    return { success: true, orderId: order.id, dailyOrderNumber: sales.totalOrders, sales };
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error('[saveOrder] Critical failure:', msg);
    return { success: false, error: msg };
  }
}

export async function fetchTodaysSales(popupId?: string | null): Promise<FetchTodaysSalesResponse> { return wrap(() => getTodaysSales(popupId)); }
export async function fetchTodaysOrders(popupId?: string | null): Promise<FetchOrdersResponse> { return wrap(() => getTodaysOrderList(popupId)); }
export async function fetchTodaysOrdersWithItems(limit?: number, popupId?: string | null): Promise<FetchOrdersWithItemsResponse> { return wrap(() => getTodaysOrderListWithItems(limit, popupId)); }
export async function fetchPendingOrders(popupId?: string | null): Promise<FetchOrdersWithItemsResponse> { return wrap(() => getPendingOrders(popupId)); }
export async function fetchOrdersByPeriod(startISO: string, endISO: string, popupId?: string | null): Promise<ApiResponse<Array<{ created_at: string; total_price: number }>>> { return wrap(() => getOrdersByPeriod(startISO, endISO, popupId)); }
export async function markOrderPrepared(id: number): Promise<ApiResponse> { return wrap(() => prepareOrder(id)); }
export async function removeOrder(id: number): Promise<ApiResponse> {
  try {
    const { data: order } = await supabaseAdmin.from('orders').select('total_price, cashier_name').eq('id', id).maybeSingle()
    const result = await wrap(() => deleteOrder(id))
    if (result.success && order) {
      const { notifyDiscord } = await import('@/lib/discord')
      const price = Number(order.total_price).toLocaleString()
      await notifyDiscord('delete', '🗑️ 주문 삭제', `주문 #${id} — ₩${price}${order.cashier_name ? ` (${order.cashier_name})` : ''}`)
    }
    return result
  } catch {
    return wrap(() => deleteOrder(id))
  }
}
