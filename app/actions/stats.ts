'use server';

import { z } from 'zod';
import { wrap, requireAdmin } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import { getKSTDateBounds, kstToday } from '@/lib/date';
import { getMenuSalesByPeriod } from '@/lib/menuSales';
import { fetchTodaysSales, fetchTodaysSalesByPopup } from './orders';
import type {
  ApiResponse,
  FetchCalendarResponse,
  FetchMenuSalesResponse,
  FetchTodaysSalesResponse,
  FetchTodayPopupSalesResponse,
  TodaysSales,
  TodayPopupSales,
  FetchDailySalesResponse,
  FetchManualSalesResponse,
  CalendarSalesData,
  DayPopupSales,
  LifetimeSalesTotals,
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

const PopupDailySalesSchema = ManualSalesSchema.omit({ note: true }).extend({
  popupId: z.number().int().positive(),
});

const ManualMenuSalesSchema = z.object({
  popupId: z.number().int().positive(),
  entries: z.array(z.object({
    menuItemId: z.number().int().positive(),
    quantity: z.number().int().min(0, '판매 수량은 0 이상이어야 합니다'),
  })),
});

const ManualDailyMenuSalesSchema = z.object({
  popupId: z.number().int().positive(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)'),
  entries: z.array(z.object({
    menuItemId: z.number().int().positive(),
    quantity: z.number().int().min(0, '판매 수량은 0 이상이어야 합니다'),
  })),
});

const ManualHourlySalesSchema = z.object({
  popupId: z.number().int().positive(),
  entries: z.array(z.object({
    hour: z.number().int().min(0).max(23),
    totalRevenue: z.number().int().min(0, '매출은 0 이상이어야 합니다'),
    totalOrders: z.number().int().min(0, '주문 수는 0 이상이어야 합니다'),
  })),
});

/**
 * 날짜별 팝업 내역 — 달력 칸에 팝업을 겹쳐 보여주기 위한 POS 기준 집계.
 * popup_id가 NULL인 주문은 떨어뜨리지 않고 "팝업 미지정"으로 남긴다 —
 * 2026-05처럼 미지정이 매출의 28%였던 달이 있어, 버리면 팝업 합이 그날 매출보다 조용히 작아진다.
 */
async function getMonthlySalesByDatePopup(year: number, month: number): Promise<Record<string, DayPopupSales[]>> {
  const { data, error } = await supabaseAdmin.rpc('get_monthly_sales_by_date_popup', {
    p_year: year,
    p_month: month,
  })
  if (error) throw error

  const byDate: Record<string, DayPopupSales[]> = {}
  for (const row of (data ?? []) as Array<{
    sale_date: string
    popup_id: number | string | null
    popup_name: string | null
    total_revenue: number | string
    order_count: number | string
  }>) {
    const list = (byDate[row.sale_date] ??= [])
    list.push({
      popupId: row.popup_id == null ? null : Number(row.popup_id),
      popupName: row.popup_name ?? '팝업 미지정',
      revenue: Number(row.total_revenue),
      orders: Number(row.order_count),
    })
  }
  for (const list of Object.values(byDate)) list.sort((a, b) => b.revenue - a.revenue)
  return byDate
}

async function getMonthlySalesByDate(year: number, month: number): Promise<CalendarSalesData> {
  // 두 집계는 서로 무관하므로 병렬로 — 달력은 두 결과가 함께 있어야 한 번에 그려진다
  const [{ data, error }, popupByDate] = await Promise.all([
    supabaseAdmin.rpc('get_monthly_sales_by_date', { p_year: year, p_month: month }),
    getMonthlySalesByDatePopup(year, month),
  ])

  if (error) throw error

  const byDate: Record<string, number> = {}
  const ordersByDate: Record<string, number> = {}

  for (const row of (data ?? []) as Array<{
    sale_date: string
    total_revenue: number
    order_count: number
  }>) {
    byDate[row.sale_date] = Number(row.total_revenue)
    ordersByDate[row.sale_date] = Number(row.order_count)
  }

  // 합계는 날짜별 값에서 파생시킨다 — 달력 칸이 읽는 byDate와 상단 월 합계가 구조적으로 어긋날 수 없다.
  // 예전에는 루프 안에서 monthTotal에 행마다 더했는데, RPC가 같은 날짜에 행을 둘(POS + 수동) 돌려주면
  // byDate는 덮어써서 하나만 남고 monthTotal만 두 번 더해져 월 매출이 부풀려졌다
  // (20261006121810 마이그레이션에서 RPC도 날짜당 1행으로 고쳤다).
  const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)

  return { byDate, monthTotal: sum(byDate), totalOrders: sum(ordersByDate), manualByDate: {}, popupByDate }
}

async function getDailySalesByPeriod(
  startISO: string,
  endISO: string,
  popupId?: string | number | null,
): Promise<DailySalesItem[]> {
  const { data, error } = await supabaseAdmin.rpc('get_orders_daily_totals', {
    p_start: startISO,
    p_end: endISO,
    p_popup_id: popupId && popupId !== '0' ? Number(popupId) : null,
  })

  if (error) throw error

  return ((data ?? []) as Array<{ sale_date: string; total_revenue: number; order_count: number }>)
    .map(row => ({ date: row.sale_date, revenue: Number(row.total_revenue), orderCount: Number(row.order_count) }))
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

/**
 * 기간 내 수동 매출. popupId를 주면 그 팝업의 정정(popup_daily_sales)이 날짜 전체 정정(daily_sales)보다
 * 우선한다 — 두 팝업이 같은 날 영업하면 날짜 전체 값은 어느 한 팝업의 매출이 아니기 때문이다.
 * 팝업 정정 행의 id는 popup_daily_sales의 id라 removeManualSales(daily_sales 삭제)에 넘기면 안 된다.
 */
async function getDailySalesForRange(startDate: string, endDate: string, popupId?: number): Promise<import('@/types/api').ManualSalesEntry[]> {
  const columns = 'id, sale_date, total_revenue, total_orders, note'
  const [dateRes, popupRes] = await Promise.all([
    supabaseAdmin.from('daily_sales').select(columns).gte('sale_date', startDate).lte('sale_date', endDate),
    popupId
      ? supabaseAdmin.from('popup_daily_sales').select(columns).eq('popup_id', popupId).gte('sale_date', startDate).lte('sale_date', endDate)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (dateRes.error) throw dateRes.error
  if (popupRes.error) throw popupRes.error

  // 팝업 쿼리가 실패하면 날짜 전체 정정만으로 돌려주지 않고 실패시킨다 — 팝업 정정이 빠진 숫자를
  // 성공처럼 보여주면 화면이 조용히 틀린다. 호출부가 실패를 토스트로 알린다.
  const byDate = new Map<string, import('@/types/api').ManualSalesEntry>()
  for (const row of (dateRes.data ?? []) as import('@/types/api').ManualSalesEntry[]) byDate.set(row.sale_date, { ...row, source: 'date' })
  for (const row of (popupRes.data ?? []) as import('@/types/api').ManualSalesEntry[]) byDate.set(row.sale_date, { ...row, source: 'popup' })
  return [...byDate.values()]
    .map(row => ({ ...row, total_revenue: Number(row.total_revenue), total_orders: Number(row.total_orders) }))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
}

async function upsertPopupDailySales(
  popupId: number,
  saleDate: string,
  totalRevenue: number,
  totalOrders: number,
): Promise<void> {
  const { error } = await supabaseAdmin.from('popup_daily_sales').upsert(
    {
      popup_id: popupId,
      sale_date: saleDate,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'popup_id,sale_date' },
  )
  if (error) throw error
}

async function deletePopupDailySales(popupId: number, saleDate: string): Promise<void> {
  const { error } = await supabaseAdmin.from('popup_daily_sales').delete().eq('popup_id', popupId).eq('sale_date', saleDate)
  if (error) throw error
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

async function getManualDailyMenuSales(popupId: number, saleDate: string): Promise<import('@/types/api').ManualDailyMenuRow[]> {
  const { data, error } = await supabaseAdmin
    .from('manual_daily_menu_sales')
    .select('sale_date, menu_item_id, quantity')
    .eq('popup_id', popupId)
    .eq('sale_date', saleDate)
  if (error) throw error
  return ((data ?? []) as Array<{ sale_date: string; menu_item_id: number; quantity: number }>)
    .map((row) => ({ saleDate: row.sale_date, menuItemId: row.menu_item_id, quantity: row.quantity }))
}

// 기간 내 날짜별 수기 입력을 메뉴 단위로 합산 — 실주문이 전혀 없던 메뉴도 누락 없이 포함하도록
// menu_items를 조인해 이름/단가/색상까지 함께 반환한다 (applyMenuManualOverrides가 그대로 병합 가능한 형태)
async function getManualDailyMenuSalesAggregate(popupId: number, startDate: string, endDate: string): Promise<MenuSalesItem[]> {
  const { data, error } = await supabaseAdmin
    .from('manual_daily_menu_sales')
    .select('quantity, menu_items(id, name, price, color)')
    .eq('popup_id', popupId)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
  if (error) throw error
  type MenuItemRef = { id: number; name: string; price: number; color: string }
  type Row = { quantity: number; menu_items: MenuItemRef | MenuItemRef[] | null }
  const agg = new Map<number, MenuSalesItem>()
  for (const row of (data ?? []) as unknown as Row[]) {
    const item = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items
    if (!item) continue
    const qty = (agg.get(item.id)?.totalQuantity ?? 0) + row.quantity
    const price = Number(item.price)
    agg.set(item.id, { id: item.id, name: item.name, price, color: item.color, totalQuantity: qty, totalRevenue: qty * price })
  }
  return [...agg.values()]
}

async function upsertManualDailyMenuSales(
  popupId: number,
  saleDate: string,
  entries: Array<{ menuItemId: number; quantity: number }>,
): Promise<void> {
  const toUpsert = entries.filter((e) => e.quantity > 0)
  const toDelete = entries.filter((e) => e.quantity <= 0).map((e) => e.menuItemId)

  if (toUpsert.length > 0) {
    const { error } = await supabaseAdmin.from('manual_daily_menu_sales').upsert(
      toUpsert.map((e) => ({
        popup_id: popupId,
        sale_date: saleDate,
        menu_item_id: e.menuItemId,
        quantity: e.quantity,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'popup_id,sale_date,menu_item_id' },
    )
    if (error) throw error
  }

  if (toDelete.length > 0) {
    const { error } = await supabaseAdmin
      .from('manual_daily_menu_sales')
      .delete()
      .eq('popup_id', popupId)
      .eq('sale_date', saleDate)
      .in('menu_item_id', toDelete)
    if (error) throw error
  }
}

async function getManualHourlySales(popupId: number): Promise<import('@/types/api').ManualHourlyEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('manual_hourly_sales')
    .select('hour, total_revenue, total_orders')
    .eq('popup_id', popupId)
    .order('hour', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Array<{ hour: number; total_revenue: number; total_orders: number }>)
    .map((row) => ({ hour: row.hour, totalRevenue: Number(row.total_revenue), totalOrders: row.total_orders }))
}

async function upsertManualHourlySales(
  popupId: number,
  entries: Array<{ hour: number; totalRevenue: number; totalOrders: number }>,
): Promise<void> {
  const toUpsert = entries.filter((e) => e.totalRevenue > 0 || e.totalOrders > 0)
  const toDelete = entries.filter((e) => e.totalRevenue <= 0 && e.totalOrders <= 0).map((e) => e.hour)

  if (toUpsert.length > 0) {
    const { error } = await supabaseAdmin.from('manual_hourly_sales').upsert(
      toUpsert.map((e) => ({
        popup_id: popupId,
        hour: e.hour,
        total_revenue: e.totalRevenue,
        total_orders: e.totalOrders,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'popup_id,hour' },
    )
    if (error) throw error
  }

  if (toDelete.length > 0) {
    const { error } = await supabaseAdmin
      .from('manual_hourly_sales')
      .delete()
      .eq('popup_id', popupId)
      .in('hour', toDelete)
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

export async function fetchMonthlySalesCalendar(year: number, month: number): Promise<FetchCalendarResponse> {
  return wrap(async () => { await requireAdmin(); return getMonthlySalesByDate(year, month); });
}
/** 첫 팝업 시작일부터 오늘까지의 누적 매출 — 통계탭 "누적 총매출" 칸 전용 */
export async function fetchLifetimeSalesTotals(): Promise<ApiResponse<LifetimeSalesTotals>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin.rpc('get_lifetime_sales_totals')
    if (error) throw error
    const row = (data ?? [])[0] as {
      total_revenue: number | string | null
      total_orders: number | string | null
      day_count: number | null
      first_date: string | null
      last_date: string | null
      popup_count: number | null
      sando_count: number | string | null
    } | undefined
    return {
      totalRevenue: Number(row?.total_revenue ?? 0),
      totalOrders: Number(row?.total_orders ?? 0),
      dayCount: Number(row?.day_count ?? 0),
      firstDate: row?.first_date ?? null,
      lastDate: row?.last_date ?? null,
      popupCount: Number(row?.popup_count ?? 0),
      sandoCount: Number(row?.sando_count ?? 0),
    }
  })
}

// ── 통계탭 "오늘" 영역 — POS 집계에 수기 정정을 덮는다 ──────────────────────────────
// POS를 쓰지 않고 백화점 전산 숫자만 수기로 넣은 날, 달력·누적은 정정을 반영하는데 "오늘" 영역만 POS를
// 읽어 0원으로 보였다. 규칙은 달력 RPC(20261016080014)와 같다:
//   팝업 하루 = popup_daily_sales > 그 팝업의 POS,  날짜 하루 = daily_sales > 팝업별 값의 합
// POS 화면용 fetchTodaysSales는 그대로 둔다 — saveOrder가 그 건수를 "오늘 N번째 주문" 번호로 쓴다.

function unwrap<T>(res: ApiResponse<T>): T {
  if (!res.success || res.data === undefined) throw new Error(res.error || '오늘 매출 조회 실패')
  return res.data
}

async function getDayOverrides(date: string) {
  const [popupRes, dayRes] = await Promise.all([
    supabaseAdmin.from('popup_daily_sales').select('popup_id, total_revenue, total_orders, popup_events(name)').eq('sale_date', date),
    supabaseAdmin.from('daily_sales').select('total_revenue, total_orders').eq('sale_date', date).maybeSingle(),
  ])
  if (popupRes.error) throw popupRes.error
  if (dayRes.error) throw dayRes.error
  type Row = { popup_id: number; total_revenue: number | string; total_orders: number; popup_events: { name: string } | { name: string }[] | null }
  const byPopup = new Map<number, { popupName: string; totalRevenue: number; totalOrders: number }>()
  for (const r of (popupRes.data ?? []) as unknown as Row[]) {
    const pe = Array.isArray(r.popup_events) ? r.popup_events[0] : r.popup_events
    byPopup.set(r.popup_id, { popupName: pe?.name ?? '?', totalRevenue: Number(r.total_revenue), totalOrders: Number(r.total_orders) })
  }
  const day: TodaysSales | null = dayRes.data
    ? { totalRevenue: Number(dayRes.data.total_revenue ?? 0), totalOrders: Number(dayRes.data.total_orders ?? 0) }
    : null
  return { byPopup, day }
}

// 정정한 팝업은 시각 정보가 없어 hourly를 비운다 — POS 곡선을 남기면 곡선과 합계가 서로 다른 숫자가 된다
function applyPopupOverrides(raw: TodayPopupSales[], byPopup: Map<number, { popupName: string; totalRevenue: number; totalOrders: number }>): TodayPopupSales[] {
  const merged = raw.filter(p => !byPopup.has(p.popupId))
  for (const [popupId, v] of byPopup) merged.push({ popupId, ...v, hourly: [], corrected: true })
  return merged.sort((a, b) => b.totalRevenue - a.totalRevenue)
}

async function getTodaysSalesWithOverrides(): Promise<TodaysSales> {
  const [summary, rawPopups, { byPopup, day }] = await Promise.all([
    fetchTodaysSales().then(unwrap),
    fetchTodaysSalesByPopup().then(unwrap),
    getDayOverrides(kstToday()),
  ])
  if (day) return day
  // 팝업 없는 주문(popup_id NULL)도 합계에 남도록 POS 합계에서 정정한 팝업의 POS분만 바꿔 끼운다
  let { totalRevenue, totalOrders } = summary
  for (const [popupId, v] of byPopup) {
    const pos = rawPopups.find(p => p.popupId === popupId)
    totalRevenue += v.totalRevenue - (pos?.totalRevenue ?? 0)
    totalOrders += v.totalOrders - (pos?.totalOrders ?? 0)
  }
  return { totalRevenue, totalOrders }
}

async function getTodaysPopupSalesWithOverrides(): Promise<TodayPopupSales[]> {
  const [rawPopups, { byPopup }] = await Promise.all([fetchTodaysSalesByPopup().then(unwrap), getDayOverrides(kstToday())])
  return applyPopupOverrides(rawPopups, byPopup)
}

// 품목 단위 대체 — 수기로 넣은 품목만 그 팝업의 POS 수량을 갈아끼운다(팝업 통계의 applyMenuManualOverrides와 같은 규칙)
async function getTodaysMenuSalesWithOverrides(popupId: number | null): Promise<MenuSalesItem[]> {
  const date = kstToday()
  const { start, end } = getKSTDateBounds(date)
  let manualQuery = supabaseAdmin
    .from('manual_daily_menu_sales')
    .select('popup_id, quantity, menu_items(id, name, price, color)')
    .eq('sale_date', date)
  if (popupId != null) manualQuery = manualQuery.eq('popup_id', popupId)
  const [pos, manualRes] = await Promise.all([getMenuSalesByPeriod(start, end, popupId), manualQuery])
  if (manualRes.error) throw manualRes.error

  type MenuItemRef = { id: number; name: string; price: number | string; color: string }
  type Row = { popup_id: number; quantity: number; menu_items: MenuItemRef | MenuItemRef[] | null }
  const manual = ((manualRes.data ?? []) as unknown as Row[])
    .map(r => ({ popupId: r.popup_id, quantity: r.quantity, item: Array.isArray(r.menu_items) ? r.menu_items[0] : r.menu_items }))
    .filter((r): r is { popupId: number; quantity: number; item: MenuItemRef } => Boolean(r.item))
  if (manual.length === 0) return pos

  // 전체 범위면 정정한 팝업별 POS 품목을 따로 받아 그 팝업 몫만 뺀다
  const popupIds = [...new Set(manual.map(m => m.popupId))]
  const posByPopup = new Map<number, MenuSalesItem[]>(
    popupId != null
      ? [[popupId, pos]]
      : await Promise.all(popupIds.map(async id => [id, await getMenuSalesByPeriod(start, end, id)] as const)),
  )

  const byId = new Map(pos.map(m => [m.id, { ...m }]))
  for (const m of manual) {
    const price = Number(m.item.price)
    const raw = posByPopup.get(m.popupId)?.find(p => p.id === m.item.id)
    const cur = byId.get(m.item.id) ?? { id: m.item.id, name: m.item.name, price, color: m.item.color, totalQuantity: 0, totalRevenue: 0 }
    cur.totalQuantity += m.quantity - (raw?.totalQuantity ?? 0)
    cur.totalRevenue += m.quantity * price - (raw?.totalRevenue ?? 0)
    byId.set(m.item.id, cur)
  }
  return [...byId.values()].filter(m => m.totalQuantity > 0)
}

export async function fetchTodaysSalesForStats(): Promise<FetchTodaysSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getTodaysSalesWithOverrides(); });
}
export async function fetchTodaysSalesByPopupForStats(): Promise<FetchTodayPopupSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getTodaysPopupSalesWithOverrides(); });
}
export async function fetchTodaysMenuSalesForStats(popupId: number | null): Promise<FetchMenuSalesResponse> {
  const parsed = z.number().int().positive().nullable().safeParse(popupId);
  if (!parsed.success) return { success: false, error: '팝업 ID가 올바르지 않습니다' };
  return wrap(async () => { await requireAdmin(); return getTodaysMenuSalesWithOverrides(parsed.data); });
}

// 팝업의 하루 매출 목록 — 정정(팝업 정정 > 날짜 전체 정정, getDailySalesForRange) > POS. 달력 RPC(20261016080014)와
// 같은 규칙이다. 팝업 통계(usePopupStats)와 팝업 비교(usePopupComparison)가 같이 쓴다 — 예전엔 두 훅이 같은 합치기
// 함수를 각자 복사해 들고 있어서, 한쪽만 고치면 같은 팝업의 매출이 화면마다 달라질 수 있었다.
// 정정 조회가 실패하면 POS 숫자만으로 돌려주지 않고 실패시킨다(조용히 틀린 숫자보다 오류가 낫다).
async function getPopupDailySales(popupId: number): Promise<DailySalesItem[]> {
  const { data: popup, error } = await supabaseAdmin.from('popup_events').select('start_date, end_date').eq('id', popupId).maybeSingle();
  if (error) throw error;
  if (!popup) throw new Error('팝업을 찾을 수 없습니다.');
  const [pos, manual] = await Promise.all([
    getDailySalesByPeriod(getKSTDateBounds(popup.start_date).start, getKSTDateBounds(popup.end_date).end, popupId),
    getDailySalesForRange(popup.start_date, popup.end_date, popupId),
  ]);
  const byDate = new Map(pos.map(d => [d.date, d]));
  for (const m of manual) byDate.set(m.sale_date, { date: m.sale_date, revenue: m.total_revenue, orderCount: m.total_orders });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchPopupDailySales(popupId: number): Promise<FetchDailySalesResponse> {
  if (!Number.isInteger(popupId) || popupId <= 0) return { success: false, error: '팝업 ID가 올바르지 않습니다' };
  return wrap(async () => { await requireAdmin(); return getPopupDailySales(popupId); });
}

export async function fetchMenuSalesBreakdown(startISO: string, endISO: string, popupId?: string | null): Promise<FetchMenuSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getMenuSalesByPeriod(startISO, endISO, popupId); });
}
export async function fetchDailySalesByPeriod(startISO: string, endISO: string, popupId?: string | null): Promise<FetchDailySalesResponse> {
  return wrap(async () => { await requireAdmin(); return getDailySalesByPeriod(startISO, endISO, popupId); });
}

export async function saveManualSales(saleDate: string, totalRevenue: number, totalOrders: number, note: string | null): Promise<ApiResponse> {
  const parsed = ManualSalesSchema.safeParse({ saleDate, totalRevenue, totalOrders, note });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAdmin(); return upsertDailySales(parsed.data.saleDate, parsed.data.totalRevenue, parsed.data.totalOrders, parsed.data.note); });
}

export async function fetchManualSalesForMonth(year: number, month: number): Promise<FetchManualSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getDailySalesForMonth(year, month); });
}
export async function fetchManualSalesForRange(startDate: string, endDate: string, popupId?: number): Promise<FetchManualSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getDailySalesForRange(startDate, endDate, popupId); });
}
export async function savePopupDailySales(popupId: number, saleDate: string, totalRevenue: number, totalOrders: number): Promise<ApiResponse> {
  const parsed = PopupDailySalesSchema.safeParse({ popupId, saleDate, totalRevenue, totalOrders });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  return wrap(async () => { await requireAdmin(); return upsertPopupDailySales(d.popupId, d.saleDate, d.totalRevenue, d.totalOrders); });
}
/** 팝업 하루 정정을 지워 그 팝업의 POS 숫자(또는 날짜 전체 정정)로 되돌린다 */
export async function removePopupDailySales(popupId: number, saleDate: string): Promise<ApiResponse> {
  const parsed = PopupDailySalesSchema.pick({ popupId: true, saleDate: true }).safeParse({ popupId, saleDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  return wrap(async () => { await requireAdmin(); return deletePopupDailySales(d.popupId, d.saleDate); });
}
export async function removeManualSales(id: number): Promise<ApiResponse> {
  return wrap(async () => { await requireAdmin(); return deleteDailySales(id); });
}
export async function fetchOrdersByDate(date: string, popupId?: string | null): Promise<ApiResponse<OrderRecordWithItems[]>> {
  return wrap(async () => { await requireAdmin(); return getOrdersByDate(date, popupId); });
}

export async function fetchManualMenuSales(popupId: number): Promise<FetchMenuSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getManualMenuSalesForPopup(popupId); });
}

export async function saveManualMenuSales(popupId: number, entries: Array<{ menuItemId: number; quantity: number }>): Promise<ApiResponse> {
  const parsed = ManualMenuSalesSchema.safeParse({ popupId, entries });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAdmin(); return upsertManualMenuSales(parsed.data.popupId, parsed.data.entries); });
}

export async function fetchManualDailyMenuSales(popupId: number, saleDate: string): Promise<import('@/types/api').FetchManualDailyMenuSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getManualDailyMenuSales(popupId, saleDate); });
}
export async function fetchManualDailyMenuSalesForRange(popupId: number, startDate: string, endDate: string): Promise<FetchMenuSalesResponse> {
  return wrap(async () => { await requireAdmin(); return getManualDailyMenuSalesAggregate(popupId, startDate, endDate); });
}
export async function saveManualDailyMenuSales(
  popupId: number,
  saleDate: string,
  entries: Array<{ menuItemId: number; quantity: number }>,
): Promise<ApiResponse> {
  const parsed = ManualDailyMenuSalesSchema.safeParse({ popupId, saleDate, entries });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAdmin(); return upsertManualDailyMenuSales(parsed.data.popupId, parsed.data.saleDate, parsed.data.entries); });
}

export async function fetchManualHourlySales(popupId: number): Promise<import('@/types/api').FetchManualHourlySalesResponse> {
  return wrap(async () => { await requireAdmin(); return getManualHourlySales(popupId); });
}
export async function saveManualHourlySales(
  popupId: number,
  entries: Array<{ hour: number; totalRevenue: number; totalOrders: number }>,
): Promise<ApiResponse> {
  const parsed = ManualHourlySalesSchema.safeParse({ popupId, entries });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAdmin(); return upsertManualHourlySales(parsed.data.popupId, parsed.data.entries); });
}
