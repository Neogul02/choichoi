'use server';

import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { z } from 'zod';
import { wrap, extractErrorMessage, requireAdmin, requireAuth, isNextInternalControlFlowError } from './_base';
import { getKSTDateBounds } from '@/lib/date';
import { getMenuSalesByPeriod } from './menu';
import type { OrderItemInput } from '@/lib/supabase';
import type { Order } from '@/types/database';
import type {
  ApiResponse,
  SaveOrderResponse,
  FetchTodaysSalesResponse,
  FetchTodayPopupSalesResponse,
  FetchOrdersResponse,
  FetchOrdersWithItemsResponse,
  TodaysSales,
  TodayPopupSales,
  OrderRecord,
  OrderRecordWithItems,
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

async function createOrder(
  items: OrderItemInput[],
  totalPrice: number,
  cashierName?: string,
  popupId?: string | number | null,
): Promise<Order> {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert([
      {
        total_price: totalPrice,
        payment_method: 'cash',
        payment_status: 'completed',
        cashier_name: cashierName ?? null,
        popup_id: popupId && popupId !== '0' ? Number(popupId) : null,
      },
    ])
    .select()
    .single()

  if (orderError) throw orderError

  const orderItems = items
    .filter((item) => item.count > 0)
    .map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.count,
      unit_price: item.price,
      subtotal: item.price * item.count,
    }))

  if (orderItems.length > 0) {
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems)
    if (itemsError) {
      // orders와 order_items 삽입이 한 트랜잭션이 아니라, 여기서 실패하면 항목 없는 유령 주문이
      // 매출 집계에 남는다 — 실패로 보고하기 전에 방금 만든 주문 행을 정리한다 (best-effort)
      await supabaseAdmin.from('orders').delete().eq('id', order.id)
      throw itemsError
    }
  }

  return order as Order
}

async function deleteOrder(id: number): Promise<void> {
  const { error: itemsError } = await supabaseAdmin
    .from('order_items')
    .delete()
    .eq('order_id', id)
  if (itemsError) throw itemsError
  const { error: orderError } = await supabaseAdmin
    .from('orders')
    .delete()
    .eq('id', id)
  if (orderError) throw orderError
}

async function getTodaysSales(popupId?: string | number | null): Promise<TodaysSales> {
  const { start, end } = getKSTDateBounds()
  // 결제 완료마다 호출되는 핫패스라 당일 주문 전체 행을 끌어와 JS에서 합산하는 대신
  // DB 집계 RPC(get_todays_sales_totals)로 단일 행만 받는다 — 주문이 쌓일수록 커지던 payload가 고정된다.
  const { data, error } = await supabaseAdmin.rpc('get_todays_sales_totals', {
    p_start: start,
    p_end: end,
    p_popup_id: popupId && popupId !== '0' ? Number(popupId) : null,
  })
  if (error) throw error

  const row = data?.[0] as { total_revenue: number | string; total_orders: number | string } | undefined
  return {
    totalOrders: Number(row?.total_orders ?? 0),
    totalRevenue: Number(row?.total_revenue ?? 0),
  }
}

async function getTodaysSalesByPopup(): Promise<TodayPopupSales[]> {
  const { start, end } = getKSTDateBounds()
  const { data, error } = await supabaseAdmin.rpc('get_todays_sales_by_popup', {
    p_start: start,
    p_end: end,
  })
  if (error) throw error

  return ((data ?? []) as Array<{
    popup_id: number | string
    popup_name: string
    total_revenue: number | string
    total_orders: number | string
  }>).map(r => ({
    popupId: Number(r.popup_id),
    popupName: r.popup_name,
    totalRevenue: Number(r.total_revenue),
    totalOrders: Number(r.total_orders),
  }))
}

async function getTodaysOrderList(popupId?: string | number | null): Promise<OrderRecord[]> {
  const { start, end } = getKSTDateBounds()
  let query = supabaseAdmin
    .from('orders')
    .select('id,total_price,created_at,payment_status,cashier_name,is_prepared,popup_events(name)')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('id', { ascending: false })
    .limit(10000)

  if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((order) => ({
    ...order,
    popup_name: (order.popup_events as unknown as { name: string } | null)?.name ?? null,
  })) as unknown as OrderRecord[]
}

async function getTodaysOrderListWithItems(
  limit?: number,
  popupId?: string | number | null,
): Promise<OrderRecordWithItems[]> {
  const { start, end } = getKSTDateBounds()
  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, total_price, created_at, payment_status, cashier_name, is_prepared, popup_events(name), order_items(menu_item_id, quantity, subtotal, menu_items(name))',
    )
    .gte('created_at', start)
    .lte('created_at', end)
    .order('id', { ascending: false })
    .limit(limit ?? 10000)

  if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((order) => {
    const rawItems = (order.order_items ?? []) as unknown as Array<{
      menu_item_id: number
      quantity: number
      subtotal: number
      menu_items: { name: string } | null
    }>
    return {
      id: order.id as number,
      total_price: Number(order.total_price),
      created_at: order.created_at as string,
      payment_status: order.payment_status as string,
      cashier_name: (order.cashier_name as string | null) ?? null,
      is_prepared: (order.is_prepared as boolean) ?? false,
      popup_name: (order.popup_events as unknown as { name: string } | null)?.name ?? null,
      items: rawItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.menu_items?.name ?? '알 수 없음',
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
    }
  })
}

async function getPendingOrders(popupId?: string | number | null): Promise<OrderRecordWithItems[]> {
  const { start, end } = getKSTDateBounds()
  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, total_price, created_at, payment_status, cashier_name, is_prepared, order_items(menu_item_id, quantity, subtotal, menu_items(name))',
    )
    .gte('created_at', start)
    .lte('created_at', end)
    .eq('is_prepared', false)
    .order('id', { ascending: false })

  if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((order) => {
    const rawItems = (order.order_items ?? []) as unknown as Array<{
      menu_item_id: number
      quantity: number
      subtotal: number
      menu_items: { name: string } | null
    }>
    return {
      id: order.id as number,
      total_price: Number(order.total_price),
      created_at: order.created_at as string,
      payment_status: order.payment_status as string,
      cashier_name: (order.cashier_name as string | null) ?? null,
      is_prepared: false,
      popup_name: null,
      items: rawItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.menu_items?.name ?? '알 수 없음',
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
    }
  })
}

async function prepareOrder(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('orders')
    .update({ is_prepared: true })
    .eq('id', id)
  if (error) throw error
}

async function getOrdersByPeriod(
  startISO: string,
  endISO: string,
  popupId?: string | number | null,
): Promise<Array<{ created_at: string; total_price: number }>> {
  const PAGE_SIZE = 1000
  const MAX_ROWS = 10000
  const result: Array<{ created_at: string; total_price: number }> = []

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('orders')
      .select('created_at, total_price')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

    const { data, error } = await query

    if (error) throw error
    if (!data || data.length === 0) break
    result.push(
      ...data.map((o) => ({
        created_at: o.created_at as string,
        total_price: Number(o.total_price),
      })),
    )
    if (data.length < PAGE_SIZE) break
  }

  return result
}

/** 주문 완료 알림에만 쓰이는 팝업 이름 조회 — 단일 호출부라 비공개로 둔다 */
async function getPopupEventName(popupId: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .select('name')
    .eq('id', popupId)
    .maybeSingle()
  if (error) throw error
  return data?.name ?? null
}

/** POS 결제 시 메뉴 재고 차감 — 단일 호출부라 비공개로 둔다 */
async function decrementMenuStock(items: { id: number; count: number }[]): Promise<void> {
  const { error } = await supabaseAdmin.rpc('decrement_menu_stock', { p_items: items })
  if (error) throw error
}

export async function saveOrder(items: OrderItemInput[], totalPrice: number, cashierName?: string, popupId?: string | null): Promise<SaveOrderResponse> {
  const parsed = SaveOrderSchema.safeParse({ items, totalPrice });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  try {
    const order = await createOrder(items, totalPrice, cashierName, popupId);

    // 할인 블록(음수 가격 메뉴)은 실물 재고가 없으므로 차감 대상에서 제외.
    // 재고 차감 실패는 주문을 막지 않으므로 매출 집계와 병렬 실행해 왕복 1회를 줄인다.
    const stockItems = items.filter((i) => i.price > 0).map((i) => ({ id: i.id, count: i.count }))
    const [sales] = await Promise.all([
      getTodaysSales(popupId),
      stockItems.length > 0
        ? decrementMenuStock(stockItems).catch((err) => console.error('[saveOrder] 메뉴 재고 차감 실패:', err))
        : Promise.resolve(),
    ]);

    // 주문 완료 알림 — 응답 반환 후 실행 (서버리스에서도 완료가 보장됨)
    after(async () => {
      try {
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
      } catch { /* 알림 실패는 무시 */ }
    });

    return { success: true, orderId: order.id, dailyOrderNumber: sales.totalOrders, sales };
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error('[saveOrder] Critical failure:', msg);
    // 원본 DB/Postgres 오류 문구는 캐셔에게 그대로 노출하지 않고 Discord로만 보고 — 응답은 막지 않는다
    after(() => import('@/lib/error-report').then((m) => m.reportError('주문 저장 실패', msg)).catch(() => {}));
    return { success: false, error: '결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' };
  }
}

export async function fetchTodaysSales(popupId?: string | null): Promise<FetchTodaysSalesResponse> { return wrap(() => getTodaysSales(popupId)); }
export async function fetchTodaysOrders(popupId?: string | null): Promise<FetchOrdersResponse> { return wrap(() => getTodaysOrderList(popupId)); }
/** 오늘 매출이 난 팝업별 집계 — POS 매출 배틀. 자기 팝업 밖 숫자를 돌려주므로 로그인은 요구한다 */
export async function fetchTodaysSalesByPopup(): Promise<FetchTodayPopupSalesResponse> {
  return wrap(async () => { await requireAuth(); return getTodaysSalesByPopup(); });
}
export async function fetchTodaysOrdersWithItems(limit?: number, popupId?: string | null): Promise<FetchOrdersWithItemsResponse> { return wrap(() => getTodaysOrderListWithItems(limit, popupId)); }
export async function fetchPendingOrders(popupId?: string | null): Promise<FetchOrdersWithItemsResponse> { return wrap(() => getPendingOrders(popupId)); }
// /stats(admin 전용) 시간대별 매출 화면에서만 쓰는 조회 — 다른 orders.ts 함수와 달리 여기만 admin 게이트가 필요
export async function fetchOrdersByPeriod(startISO: string, endISO: string, popupId?: string | null): Promise<ApiResponse<Array<{ created_at: string; total_price: number }>>> {
  return wrap(async () => { await requireAdmin(); return getOrdersByPeriod(startISO, endISO, popupId); });
}
export async function markOrderPrepared(id: number): Promise<ApiResponse> { return wrap(() => prepareOrder(id)); }
export async function removeOrder(id: number): Promise<ApiResponse> {
  try {
    await requireAdmin()
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: extractErrorMessage(err) }
  }
  return wrap(() => deleteOrder(id))
}
