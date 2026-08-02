'use server';

import { z } from 'zod';
import { wrap } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import { getKSTDateBounds } from '@/lib/date';
import { getMenuSalesByPeriod } from './menu';
import type {
  ApiResponse,
  FetchCalendarResponse,
  FetchMenuSalesResponse,
  FetchDailySalesResponse,
  FetchManualSalesResponse,
  CalendarSalesData,
  DailySalesItem,
  MenuSalesItem,
  OrderRecordWithItems,
} from '@/types/api';

const ManualSalesSchema = z.object({
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)'),
  totalRevenue: z.number().int().min(0, '매출은 0 이상이어야 합니다'),
  totalOrders: z.number().int().min(0, '주문 수는 0 이상이어야 합니다'),
  note: z.string().max(200).nullable(),
});

const ManualMenuSalesSchema = z.object({
  popupId: z.number().int().positive(),
  entries: z.array(z.object({
    menuItemId: z.number().int().positive(),
    quantity: z.number().int().min(0, '판매 수량은 0 이상이어야 합니다'),
  })),
});

async function getMonthlySalesByDate(year: number, month: number): Promise<CalendarSalesData> {
  const { data, error } = await supabaseAdmin.rpc('get_monthly_sales_by_date', {
    p_year: year,
    p_month: month,
  })

  if (error) throw error

  const byDate: Record<string, number> = {}
  let monthTotal = 0
  let totalOrders = 0

  for (const row of (data ?? []) as Array<{
    sale_date: string
    total_revenue: number
    order_count: number
  }>) {
    byDate[row.sale_date] = Number(row.total_revenue)
    monthTotal += Number(row.total_revenue)
    totalOrders += Number(row.order_count)
  }

  return { byDate, monthTotal, totalOrders, manualByDate: {} }
}

async function getDailySalesByPeriod(
  startISO: string,
  endISO: string,
  popupId?: string | number | null,
): Promise<DailySalesItem[]> {
  const PAGE_SIZE = 1000
  const MAX_ROWS = 10000
  const allOrders: Array<{ total_price: string | number; created_at: string }> = []

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('orders')
      .select('total_price, created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

    const { data, error } = await query

    if (error) throw error
    if (!data || data.length === 0) break
    allOrders.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  if (allOrders.length === 0) return []

  const dayMap: Record<string, { revenue: number; orderCount: number }> = {}
  for (const order of allOrders) {
    const utcMs = new Date(order.created_at as string).getTime()
    const kstDate = new Date(utcMs + 9 * 3600 * 1000)
      .toISOString()
      .split('T')[0]
    if (!dayMap[kstDate]) dayMap[kstDate] = { revenue: 0, orderCount: 0 }
    dayMap[kstDate].revenue += parseFloat(String(order.total_price))
    dayMap[kstDate].orderCount += 1
  }

  return Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { revenue, orderCount }]) => ({ date, revenue, orderCount }))
}

async function upsertDailySales(
  saleDate: string,
  totalRevenue: number,
  totalOrders: number,
  note: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin.from('daily_sales').upsert(
    {
      sale_date: saleDate,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'sale_date' },
  )
  if (error) throw error
}

async function getDailySalesForMonth(year: number, month: number): Promise<import('@/types/api').ManualSalesEntry[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data, error } = await supabaseAdmin
    .from('daily_sales')
    .select('id, sale_date, total_revenue, total_orders, note')
    .gte('sale_date', start)
    .lt('sale_date', end)
    .order('sale_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as import('@/types/api').ManualSalesEntry[]
}

async function getDailySalesForRange(startDate: string, endDate: string): Promise<import('@/types/api').ManualSalesEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('daily_sales')
    .select('id, sale_date, total_revenue, total_orders, note')
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as import('@/types/api').ManualSalesEntry[]
}

async function deleteDailySales(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('daily_sales')
    .delete()
    .eq('id', id)
  if (error) throw error
}

async function getManualMenuSalesForPopup(popupId: number): Promise<MenuSalesItem[]> {
  const { data, error } = await supabaseAdmin
    .from('manual_menu_sales')
    .select('quantity, menu_items(id, name, price, color)')
    .eq('popup_id', popupId)
  if (error) throw error
  type MenuItemRef = { id: number; name: string; price: number; color: string }
  type Row = { quantity: number; menu_items: MenuItemRef | MenuItemRef[] | null }
  return ((data ?? []) as unknown as Row[])
    .map((row) => ({ quantity: row.quantity, item: Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items }))
    .filter((row): row is { quantity: number; item: MenuItemRef } => Boolean(row.item))
    .map((row) => ({
      id: row.item.id,
      name: row.item.name,
      price: Number(row.item.price),
      color: row.item.color,
      totalQuantity: row.quantity,
      totalRevenue: row.quantity * Number(row.item.price),
    }))
}

async function upsertManualMenuSales(
  popupId: number,
  entries: Array<{ menuItemId: number; quantity: number }>,
): Promise<void> {
  const toUpsert = entries.filter((e) => e.quantity > 0)
  const toDelete = entries.filter((e) => e.quantity <= 0).map((e) => e.menuItemId)

  if (toUpsert.length > 0) {
    const { error } = await supabaseAdmin.from('manual_menu_sales').upsert(
      toUpsert.map((e) => ({
        popup_id: popupId,
        menu_item_id: e.menuItemId,
        quantity: e.quantity,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'popup_id,menu_item_id' },
    )
    if (error) throw error
  }

  if (toDelete.length > 0) {
    const { error } = await supabaseAdmin
      .from('manual_menu_sales')
      .delete()
      .eq('popup_id', popupId)
      .in('menu_item_id', toDelete)
    if (error) throw error
  }
}

/** 특정 날짜(KST)의 주문 목록 — 단일 호출부(fetchOrdersByDate)라 비공개로 둔다 */
async function getOrdersByDate(kstDateStr: string, popupId?: string | number | null): Promise<OrderRecordWithItems[]> {
  const { start, end } = getKSTDateBounds(kstDateStr)
  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, total_price, created_at, payment_status, cashier_name, is_prepared, order_items(menu_item_id, quantity, subtotal, menu_items(name))',
    )
    .gte('created_at', start)
    .lte('created_at', end)
    .order('id', { ascending: false })
    .limit(10000)

  if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

  const { data, error } = await query
  if (error) throw error
  type OrderItemRow = {
    menu_item_id: number
    quantity: number
    subtotal: number | string
    menu_items: { name: string } | null
  }
  type OrderRow = {
    id: number
    total_price: number | string
    created_at: string
    payment_status: string
    cashier_name: string | null
    is_prepared: boolean
    order_items: OrderItemRow[] | null
  }
  // menu_items는 다대일 관계라 런타임엔 객체지만, select 문자열 추론은 배열로 잡아 unknown 경유가 필요
  return ((data ?? []) as unknown as OrderRow[]).map(order => ({
    id: order.id,
    total_price: Number(order.total_price),
    created_at: order.created_at,
    payment_status: order.payment_status,
    cashier_name: order.cashier_name,
    is_prepared: order.is_prepared,
    popup_name: null,
    items: (order.order_items ?? []).map(item => ({
      menu_item_id: item.menu_item_id,
      name: item.menu_items?.name ?? '알 수 없음',
      quantity: item.quantity,
      subtotal: Number(item.subtotal),
    })),
  }))
}

export async function fetchMonthlySalesCalendar(year: number, month: number): Promise<FetchCalendarResponse> { return wrap(() => getMonthlySalesByDate(year, month)); }
export async function fetchMenuSalesBreakdown(startISO: string, endISO: string, popupId?: string | null): Promise<FetchMenuSalesResponse> { return wrap(() => getMenuSalesByPeriod(startISO, endISO, popupId)); }
export async function fetchDailySalesByPeriod(startISO: string, endISO: string, popupId?: string | null): Promise<FetchDailySalesResponse> { return wrap(() => getDailySalesByPeriod(startISO, endISO, popupId)); }

export async function saveManualSales(saleDate: string, totalRevenue: number, totalOrders: number, note: string | null): Promise<ApiResponse> {
  const parsed = ManualSalesSchema.safeParse({ saleDate, totalRevenue, totalOrders, note });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => upsertDailySales(parsed.data.saleDate, parsed.data.totalRevenue, parsed.data.totalOrders, parsed.data.note));
}

export async function fetchManualSalesForMonth(year: number, month: number): Promise<FetchManualSalesResponse> { return wrap(() => getDailySalesForMonth(year, month)); }
export async function fetchManualSalesForRange(startDate: string, endDate: string): Promise<FetchManualSalesResponse> { return wrap(() => getDailySalesForRange(startDate, endDate)); }
export async function removeManualSales(id: number): Promise<ApiResponse> { return wrap(() => deleteDailySales(id)); }
export async function fetchOrdersByDate(date: string, popupId?: string | null): Promise<ApiResponse<OrderRecordWithItems[]>> { return wrap(() => getOrdersByDate(date, popupId)); }

export async function fetchManualMenuSales(popupId: number): Promise<FetchMenuSalesResponse> { return wrap(() => getManualMenuSalesForPopup(popupId)); }

export async function saveManualMenuSales(popupId: number, entries: Array<{ menuItemId: number; quantity: number }>): Promise<ApiResponse> {
  const parsed = ManualMenuSalesSchema.safeParse({ popupId, entries });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => upsertManualMenuSales(parsed.data.popupId, parsed.data.entries));
}
