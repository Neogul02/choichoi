'use server';

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
  clearTodaysOrders,
  deductForOrder,
} from '@/lib/supabase-admin';
import type { OrderItemInput } from '@/lib/supabase';
import type {
  ApiResponse,
  SaveOrderResponse,
  ResetSalesResponse,
  FetchTodaysSalesResponse,
  FetchOrdersResponse,
  FetchOrdersWithItemsResponse,
} from '@/types/api';

const SaveOrderSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    price: z.number().int().positive(),
    count: z.number().int().positive(),
  })).min(1, '주문 항목이 없습니다'),
  totalPrice: z.number().int().positive('총 금액이 올바르지 않습니다'),
});

export async function saveOrder(items: OrderItemInput[], totalPrice: number, cashierName?: string, popupId?: string | null): Promise<SaveOrderResponse> {
  const parsed = SaveOrderSchema.safeParse({ items, totalPrice });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  try {
    console.log(`[saveOrder] Starting order creation. Items: ${items.length}, Total: ${totalPrice}`);
    const order = await createOrder(items, totalPrice, cashierName, popupId);
    const sales = await getTodaysSales(popupId);

    let inventoryError: string | undefined;
    try {
      console.log(`[saveOrder] Triggering inventory deduction for order ${order.id}`);
      await deductForOrder(order.id);
      console.log(`[saveOrder] Inventory deduction successful for order ${order.id}`);
      // 재고 소진 알림 (fire-and-forget)
      import('@supabase/supabase-js').then(({ createClient }) => {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
        return admin.from('ingredients').select('name').eq('sealed_count', 0).lte('opened_remaining', 0)
      }).then(async (res) => {
        if (!res || !('data' in res) || !res.data?.length) return
        const names = res.data.map((r: { name: string }) => r.name).join(', ')
        const { notifyDiscord } = await import('@/lib/discord')
        await notifyDiscord('delete', '⚠️ 재고 소진', `다음 재료가 소진되었습니다: **${names}**`)
      }).catch(() => {})
    } catch (err) {
      inventoryError = extractErrorMessage(err);
      console.error(`[saveOrder] deductForOrder failed for order ${order.id}:`, err);
    }

    if (cashierName) {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
        await adminClient.rpc('increment_worker_revenue', { p_name: cashierName, p_amount: totalPrice })
      } catch (err) {
        console.error('[saveOrder] revenue increment failed:', err)
      }
    }

    return { success: true, orderId: order.id, dailyOrderNumber: sales.totalOrders, sales, inventoryError };
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error('[saveOrder] Critical failure:', msg);
    return { success: false, error: msg };
  }
}

export async function resetTodaysSales(): Promise<ResetSalesResponse> {
  try {
    const result = await clearTodaysOrders();
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
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
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data: order } = await admin.from('orders').select('total_price, cashier_name').eq('id', id).maybeSingle()
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
