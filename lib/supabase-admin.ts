import { createClient } from '@supabase/supabase-js'
import type {
  MenuItem,
  Order,
  PopupEvent,
  ScheduleSlot,
  Memo,
  Worker,
  Ingredient,
  Recipe,
  RestockEvent,
  DeductionEvent,
} from '@/types/database'
import type {
  TodaysSales,
  MenuSalesItem,
  CalendarSalesData,
  OrderRecord,
  OrderRecordWithItems,
  DailySalesItem,
} from '@/types/api'
import type { OrderItemInput, WorkerInput } from '@/lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.error('[Supabase Admin] Missing NEXT_PUBLIC_SUPABASE_URL')
}

if (!serviceKey) {
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[Supabase Admin] Missing SUPABASE_SERVICE_ROLE_KEY in production! Falling back to ANON_KEY. RLS might block operations.',
    )
  } else {
    console.log('[Supabase Admin] No SERVICE_ROLE_KEY found, using ANON_KEY.')
  }
}

const supabaseKey = serviceKey || anonKey || ''
if (supabaseKey === serviceKey && serviceKey) {
  console.log('[Supabase Admin] Initializing with SERVICE_ROLE_KEY')
} else if (supabaseKey === anonKey && anonKey) {
  console.log('[Supabase Admin] Initializing with ANON_KEY')
}

const supabaseAdmin = createClient(supabaseUrl || '', supabaseKey)

function getKSTDateStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0]
}

function getKSTDateBounds(kstDateStr?: string): { start: string; end: string } {
  const d = kstDateStr ?? getKSTDateStr()
  return { start: `${d}T00:00:00+09:00`, end: `${d}T23:59:59+09:00` }
}

export async function getMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getTodaysSales(popupId?: string | number | null): Promise<TodaysSales> {
  const { start, end } = getKSTDateBounds()
  let query = supabaseAdmin
    .from('orders')
    .select('total_price')
    .gte('created_at', start)
    .lte('created_at', end)
    .limit(10000)

  if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

  const { data, error } = await query
  if (error) throw error

  const totalRevenue =
    data?.reduce(
      (sum, order) => sum + parseFloat(String(order.total_price)),
      0,
    ) ?? 0
  return {
    totalOrders: data?.length ?? 0,
    totalRevenue,
  }
}

export async function getTodaysOrderList(popupId?: string | number | null): Promise<OrderRecord[]> {
  const { start, end } = getKSTDateBounds()
  let query = supabaseAdmin
    .from('orders')
    .select('id,total_price,created_at,payment_status,cashier_name,is_prepared')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('id', { ascending: false })
    .limit(10000)

  if (popupId && popupId !== '0') query = query.eq('popup_id', Number(popupId))

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getTodaysOrderListWithItems(
  limit?: number,
  popupId?: string | number | null,
): Promise<OrderRecordWithItems[]> {
  const { start, end } = getKSTDateBounds()
  let query = supabaseAdmin
    .from('orders')
    .select(
      'id, total_price, created_at, payment_status, cashier_name, is_prepared, order_items(menu_item_id, quantity, subtotal, menu_items(name))',
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
      items: rawItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.menu_items?.name ?? '알 수 없음',
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
    }
  })
}

export async function clearTodaysOrders(): Promise<{ deletedCount: number }> {
  const { start, end } = getKSTDateBounds()

  const { data, error } = await supabaseAdmin
    .from('orders')
    .delete()
    .gte('created_at', start)
    .lte('created_at', end)
    .select('id')

  if (error) throw error
  return { deletedCount: data?.length ?? 0 }
}

export async function createOrder(
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
    if (itemsError) throw itemsError
  }

  return order as Order
}

export async function deleteOrder(id: number): Promise<void> {
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

export async function getPendingOrders(popupId?: string | number | null): Promise<OrderRecordWithItems[]> {
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
      items: rawItems.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.menu_items?.name ?? '알 수 없음',
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
    }
  })
}

export async function prepareOrder(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('orders')
    .update({ is_prepared: true })
    .eq('id', id)
  if (error) throw error
}

export async function addMenuItem(
  name: string,
  price: number,
  color: string,
): Promise<MenuItem> {
  const { data: lastItem, error: lastItemError } = await supabaseAdmin
    .from('menu_items')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastItemError) throw lastItemError

  const nextDisplayOrder = ((lastItem?.display_order as number) || 0) + 1

  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .insert([
      {
        name,
        price,
        color,
        stock: 999,
        is_active: true,
        display_order: nextDisplayOrder,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as MenuItem
}

export async function updateMenuItem(
  id: number,
  name: string,
  price: number,
  color: string,
): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({ name, price, color, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as MenuItem
}

export async function deleteMenuItem(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('menu_items')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

export async function getAllMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getMonthlySalesByDate(
  year: number,
  month: number,
): Promise<CalendarSalesData> {
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

export async function updateMenuOrder(orderedIds: number[]): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabaseAdmin
      .from('menu_items')
      .update({
        display_order: index + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

// ── Popup Events ──────────────────────────────────────────────────────────────

export async function getPopupEvents(): Promise<PopupEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .select('*')
    .order('start_date', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function createPopupEvent(
  name: string,
  startDate: string,
  endDate: string,
): Promise<PopupEvent> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .insert([{ name, start_date: startDate, end_date: endDate }])
    .select()
    .single()
  if (error) throw error
  return data as PopupEvent
}

export async function deletePopupEvent(id: number): Promise<void> {
  await supabaseAdmin.from('schedule_slots').delete().eq('event_id', id)
  const { error } = await supabaseAdmin
    .from('popup_events')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updatePopupEvent(
  id: number,
  name: string,
  startDate: string,
  endDate: string,
): Promise<PopupEvent> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .update({ name, start_date: startDate, end_date: endDate })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PopupEvent
}

// ── Schedule Slots ────────────────────────────────────────────────────────────

export async function getScheduleByEvent(
  eventId: number,
): Promise<ScheduleSlot[]> {
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addScheduleSlot(
  eventId: number,
  scheduleDate: string,
  role: string,
  personName: string,
  workTime: string,
  workerId?: number,
  breakTime?: number,
): Promise<ScheduleSlot> {
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .insert([
      {
        event_id: eventId,
        schedule_date: scheduleDate,
        role,
        person_name: personName,
        work_time: workTime || null,
        break_time: breakTime ?? 0,
        worker_id: workerId ?? null,
      },
    ])
    .select()
    .single()
  if (error) throw error
  return data as ScheduleSlot
}

export async function removeScheduleSlot(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('schedule_slots')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updateScheduleSlot(
  id: number,
  personName: string,
  workTime: string,
  workerId?: number | null,
  breakTime?: number,
): Promise<ScheduleSlot> {
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .update({
      person_name: personName,
      work_time: workTime || null,
      break_time: breakTime ?? 0,
      worker_id: workerId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ScheduleSlot
}

export async function copyScheduleSlot(
  sourceId: number,
  newDate: string,
  newRole: string,
): Promise<ScheduleSlot> {
  const { data: source, error: fetchError } = await supabaseAdmin
    .from('schedule_slots')
    .select('*')
    .eq('id', sourceId)
    .single()
  if (fetchError) throw fetchError
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .insert([
      {
        event_id: source.event_id,
        schedule_date: newDate,
        role: newRole,
        person_name: source.person_name,
        work_time: source.work_time,
        break_time: source.break_time ?? 0,
        worker_id: source.worker_id,
      },
    ])
    .select()
    .single()
  if (error) throw error
  return data as ScheduleSlot
}

export async function moveScheduleSlot(
  id: number,
  newDate: string,
  newRole: string,
): Promise<ScheduleSlot> {
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .update({
      schedule_date: newDate,
      role: newRole,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ScheduleSlot
}

// ── Memos ─────────────────────────────────────────────────────────────────────

export async function getAllMemos(): Promise<Memo[]> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createMemo(
  title: string,
  content: string,
  color: string,
): Promise<Memo> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .insert([{ title: title || null, content, color: color || '#fff9c4' }])
    .select()
    .single()
  if (error) throw error
  return data as Memo
}

export async function updateMemo(
  id: number,
  title: string,
  content: string,
  color: string,
): Promise<Memo> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .update({
      title: title || null,
      content,
      color: color || '#fff9c4',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Memo
}

export async function deleteMemo(id: number): Promise<void> {
  const { error } = await supabaseAdmin.from('memos').delete().eq('id', id)
  if (error) throw error
}

export async function toggleMemoPin(
  id: number,
  isPinned: boolean,
): Promise<Memo> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Memo
}

// ── Menu Sales ────────────────────────────────────────────────────────────────

export async function getDailySalesByPeriod(
  startISO: string,
  endISO: string,
): Promise<DailySalesItem[]> {
  const PAGE_SIZE = 1000
  const MAX_ROWS = 10000
  const allOrders: Array<{ total_price: string | number; created_at: string }> =
    []

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('total_price, created_at')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

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

export async function getOrdersByPeriod(
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

export async function getMenuSalesByPeriod(
  startISO: string,
  endISO: string,
): Promise<MenuSalesItem[]> {
  const { data, error } = await supabaseAdmin.rpc('get_menu_sales_by_period', {
    p_start: startISO,
    p_end: endISO,
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

// ── Workers ───────────────────────────────────────────────────────────────────

export async function getWorkers(eventId: number): Promise<Worker[]> {
  const { data, error } = await supabaseAdmin
    .from('workers')
    .select('*')
    .eq('event_id', eventId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createWorker(input: WorkerInput): Promise<Worker> {
  const { data, error } = await supabaseAdmin
    .from('workers')
    .insert([
      {
        event_id: input.event_id,
        name: input.name,
        color: input.color || '#6366f1',
        phone: input.phone || null,
        bank_name: input.bank_name || null,
        bank_account: input.bank_account || null,
        hourly_rate: input.hourly_rate ?? 0,
        worker_role: input.worker_role || '프론트',
        user_profile_id: input.user_profile_id || null,
      },
    ])
    .select()
    .single()
  if (error) throw error
  return data as Worker
}

export async function updateWorker(
  id: number,
  input: WorkerInput,
): Promise<Worker> {
  const { data, error } = await supabaseAdmin
    .from('workers')
    .update({
      name: input.name,
      color: input.color || '#6366f1',
      phone: input.phone || null,
      bank_name: input.bank_name || null,
      bank_account: input.bank_account || null,
      hourly_rate: input.hourly_rate ?? 0,
      worker_role: input.worker_role || '프론트',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Worker
}

export async function deleteWorker(id: number): Promise<void> {
  const { error } = await supabaseAdmin.from('workers').delete().eq('id', id)
  if (error) throw error
}

export async function setWorkerPaymentDone(
  id: number,
  done: boolean,
): Promise<Worker> {
  const { data, error } = await supabaseAdmin
    .from('workers')
    .update({ payment_done: done, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Worker
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export async function getIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Ingredient[]
}

export async function addRestock(
  ingredient_id: string,
  sealed_delta: number,
  opened_delta: number,
  note?: string,
  created_by?: string,
): Promise<void> {
  const { error: evtErr } = await supabaseAdmin.from('restock_events').insert([
    {
      ingredient_id,
      sealed_delta,
      opened_delta,
      note: note ?? null,
      created_by: created_by ?? null,
    },
  ])
  if (evtErr) throw evtErr

  const { data: ing, error: fetchErr } = await supabaseAdmin
    .from('ingredients')
    .select('sealed_count, opened_remaining')
    .eq('id', ingredient_id)
    .single()
  if (fetchErr) throw fetchErr

  const { error: upErr } = await supabaseAdmin
    .from('ingredients')
    .update({
      sealed_count: (ing.sealed_count as number) + sealed_delta,
      opened_remaining: Math.max(
        0,
        (ing.opened_remaining as number) + opened_delta,
      ),
    })
    .eq('id', ingredient_id)
  if (upErr) throw upErr
}

export async function physicalInventory(
  id: string,
  sealed_count: number,
  opened_remaining: number,
): Promise<Ingredient> {
  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .update({ sealed_count, opened_remaining: Math.max(0, opened_remaining) })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Ingredient
}

export async function getRecipesWithIngredients(): Promise<Recipe[]> {
  const { data, error } = await supabaseAdmin
    .from('recipes')
    .select('*, ingredients(*), menu_items(id, name)')
  if (error) throw error
  return (data ?? []) as unknown as Recipe[]
}

export async function upsertRecipe(
  menu_id: number,
  ingredient_id: string,
  qty_per_unit: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('recipes')
    .upsert([{ menu_id, ingredient_id, qty_per_unit }], {
      onConflict: 'menu_id,ingredient_id',
    })
  if (error) throw error
}

export async function deleteRecipe(
  menu_id: number,
  ingredient_id: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('recipes')
    .delete()
    .eq('menu_id', menu_id)
    .eq('ingredient_id', ingredient_id)
  if (error) throw error
}

export async function getRecentDeductions(
  limit = 30,
): Promise<DeductionEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('deduction_events')
    .select('*, ingredients(id, name, base_unit)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as DeductionEvent[]
}

export async function getRecentOrderLogs(
  limit = 20,
): Promise<import('@/types/api').OrderLogEntry[]> {
  const { data: deductions, error: dErr } = await supabaseAdmin
    .from('deduction_events')
    .select(
      'order_id, qty_deducted, created_at, ingredient_id, ingredients(name, base_unit)',
    )
    .order('created_at', { ascending: false })
    .limit(limit * 8) // Increased multiplier to ensure we get enough orders
  if (dErr) throw dErr

  const rows = (deductions ?? []) as unknown as Array<{
    order_id: number | null
    qty_deducted: number
    created_at: string
    ingredient_id: string
    ingredients: { name: string; base_unit: string } | null
  }>

  // Filter out rows with null order_id to prevent query errors and group by order_id
  const orderIds = [
    ...new Set(
      rows.map((r) => r.order_id).filter((id): id is number => id !== null),
    ),
  ].slice(0, limit)
  if (orderIds.length === 0) return []

  const { data: items, error: iErr } = await supabaseAdmin
    .from('order_items')
    .select('order_id, quantity, menu_items(name)')
    .in('order_id', orderIds)
  if (iErr) throw iErr

  const itemRows = (items ?? []) as unknown as Array<{
    order_id: number
    quantity: number
    menu_items: { name: string } | null
  }>

  return orderIds.map((orderId) => {
    const deductionRows = rows.filter((r) => r.order_id === orderId)
    const menuRows = itemRows.filter((i) => i.order_id === orderId)
    return {
      orderId,
      createdAt: deductionRows[0]?.created_at ?? '',
      menuItems: menuRows.map((i) => ({
        name: i.menu_items?.name ?? '메뉴',
        quantity: i.quantity,
      })),
      deductions: deductionRows.map((d) => ({
        name: d.ingredients?.name ?? d.ingredient_id,
        qty: Number(d.qty_deducted),
        unit: d.ingredients?.base_unit ?? '',
      })),
    }
  })
}

export async function deductForOrder(orderId: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc('deduct_for_order', {
    p_order_id: orderId,
  })
  if (error) throw error
}

export async function addIngredient(data: {
  id: string
  name: string
  category: string
  color: string
  unit_type: 'count' | 'weight'
  base_unit: string
  container_unit: string
  container_size: number
  reorder_at_containers: number
  sort_order?: number
}): Promise<Ingredient> {
  const { data: row, error } = await supabaseAdmin
    .from('ingredients')
    .insert([{ ...data, sort_order: data.sort_order ?? 0 }])
    .select()
    .single()
  if (error) throw error
  return row as Ingredient
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ingredients')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updateIngredientMeta(
  id: string,
  updates: {
    container_size?: number
    reorder_at_containers?: number
    vendor?: string
  },
): Promise<Ingredient> {
  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Ingredient
}

// ── Manual Sales (daily_sales) ────────────────────────────────────────────────

export async function upsertDailySales(
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

export async function getDailySalesForMonth(
  year: number,
  month: number,
): Promise<import('@/types/api').ManualSalesEntry[]> {
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

export async function deleteDailySales(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('daily_sales')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getOrdersByDate(
  kstDateStr: string,
  popupId?: string | number | null,
): Promise<import('@/types/api').OrderRecordWithItems[]> {
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
  return (data ?? []).map((order: any) => ({
    id: order.id,
    total_price: Number(order.total_price),
    created_at: order.created_at,
    payment_status: order.payment_status,
    cashier_name: order.cashier_name,
    is_prepared: order.is_prepared,
    items: (order.order_items ?? []).map((item: any) => ({
      menu_item_id: item.menu_item_id,
      name: item.menu_items?.name ?? '알 수 없음',
      quantity: item.quantity,
      subtotal: Number(item.subtotal),
    })),
  }))
}

// ── Cheers ────────────────────────────────────────────────────────────────────

export async function incrementCheer(
  popupId: number,
  workerName: string,
): Promise<number> {
  const today = getKSTDateStr()
  const { data: existing } = await supabaseAdmin
    .from('cheers')
    .select('count')
    .eq('popup_id', popupId)
    .eq('worker_name', workerName)
    .eq('date', today)
    .maybeSingle()
  const newCount = (existing?.count ?? 0) + 1
  const { error } = await supabaseAdmin.from('cheers').upsert(
    {
      popup_id: popupId,
      worker_name: workerName,
      date: today,
      count: newCount,
    },
    { onConflict: 'popup_id,worker_name,date' },
  )
  if (error) throw error
  return newCount
}

export async function getTodayCheersByPopup(
  popupId: number,
): Promise<Array<{ worker_name: string; count: number }>> {
  const today = getKSTDateStr()
  const { data, error } = await supabaseAdmin
    .from('cheers')
    .select('worker_name, count')
    .eq('popup_id', popupId)
    .eq('date', today)
  if (error) throw error
  return data ?? []
}

export async function resetTodayCheersByPopup(popupId: number): Promise<void> {
  const today = getKSTDateStr()
  const { error } = await supabaseAdmin
    .from('cheers')
    .delete()
    .eq('popup_id', popupId)
    .eq('date', today)
  if (error) throw error
}
