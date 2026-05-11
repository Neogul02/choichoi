import { createClient } from '@supabase/supabase-js';
import type { MenuItem, Order, OrderItem, PopupEvent, ScheduleSlot, Memo, Worker } from '@/types/database';
import type { TodaysSales, MenuSalesItem, CalendarSalesData, OrderRecord } from '@/types/api';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

function getKSTDateStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
}

function getKSTDateBounds(kstDateStr?: string): { start: string; end: string } {
  const d = kstDateStr ?? getKSTDateStr();
  return { start: `${d}T00:00:00+09:00`, end: `${d}T23:59:59+09:00` };
}

export async function getMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getTodaysSales(): Promise<TodaysSales> {
  const { start, end } = getKSTDateBounds();
  const { data, error } = await supabase
    .from('orders')
    .select('total_price')
    .gte('created_at', start)
    .lte('created_at', end)
    .limit(10000);

  if (error) throw error;

  const totalRevenue = data?.reduce((sum, order) => sum + parseFloat(String(order.total_price)), 0) ?? 0;
  return {
    totalOrders: data?.length ?? 0,
    totalRevenue,
  };
}

export async function getTodaysOrderList(): Promise<OrderRecord[]> {
  const { start, end } = getKSTDateBounds();
  const { data, error } = await supabase
    .from('orders')
    .select('id,total_price,created_at,payment_status')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('id', { ascending: false })
    .limit(10000);

  if (error) throw error;
  return data ?? [];
}

export async function clearTodaysOrders(): Promise<{ deletedCount: number }> {
  const { start, end } = getKSTDateBounds();

  const { data: todayOrders, error: fetchError } = await supabase
    .from('orders')
    .select('id')
    .gte('created_at', start)
    .lte('created_at', end)
    .limit(10000);

  if (fetchError) throw fetchError;
  if (!todayOrders || todayOrders.length === 0) return { deletedCount: 0 };

  const orderIds = todayOrders.map((order) => order.id as number);

  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .in('id', orderIds);

  if (deleteError) throw deleteError;
  return { deletedCount: orderIds.length };
}

export interface OrderItemInput {
  id: number;
  name: string;
  price: number;
  count: number;
}

export async function createOrder(items: OrderItemInput[], totalPrice: number): Promise<Order & { dailyOrderNumber: number }> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert([{ total_price: totalPrice, payment_method: 'cash', payment_status: 'completed' }])
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItems = items
    .filter((item) => item.count > 0)
    .map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.count,
      unit_price: item.price,
      subtotal: item.price * item.count,
    }));

  if (orderItems.length > 0) {
    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;
  }

  const { start, end } = getKSTDateBounds();
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', start)
    .lte('created_at', end);

  return { ...(order as Order), dailyOrderNumber: count ?? 1 };
}

export async function addMenuItem(name: string, price: number, color: string): Promise<MenuItem> {
  const { data: lastItem, error: lastItemError } = await supabase
    .from('menu_items')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastItemError) throw lastItemError;

  const nextDisplayOrder = ((lastItem?.display_order as number) || 0) + 1;

  const { data, error } = await supabase
    .from('menu_items')
    .insert([{ name, price, color, stock: 999, is_active: true, display_order: nextDisplayOrder }])
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function updateMenuItem(id: number, name: string, price: number, color: string): Promise<MenuItem> {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ name, price, color, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as MenuItem;
}

export async function deleteMenuItem(id: number): Promise<void> {
  const { error } = await supabase.from('menu_items').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function getAllMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getMonthlySalesByDate(year: number, month: number): Promise<CalendarSalesData> {
  const paddedMonth = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  const paddedLastDay = String(daysInMonth).padStart(2, '0');
  const start = `${year}-${paddedMonth}-01T00:00:00+09:00`;
  const end = `${year}-${paddedMonth}-${paddedLastDay}T23:59:59+09:00`;

  const PAGE_SIZE = 1000;
  const allOrders: { created_at: string; total_price: number }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('created_at,total_price')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrders.push(...(data as { created_at: string; total_price: number }[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const byDate: Record<string, number> = {};
  let monthTotal = 0;

  for (const order of allOrders) {
    const kstMs = new Date(order.created_at).getTime() + 9 * 3600 * 1000;
    const dateKey = new Date(kstMs).toISOString().slice(0, 10);
    const amount = Number(order.total_price || 0);
    byDate[dateKey] = (byDate[dateKey] || 0) + amount;
    monthTotal += amount;
  }

  return { byDate, monthTotal, totalOrders: allOrders.length };
}

export async function updateMenuOrder(orderedIds: number[]): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabase
      .from('menu_items')
      .update({ display_order: index + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

// ── Popup Events ──────────────────────────────────────────────────────────────

export async function getPopupEvents(): Promise<PopupEvent[]> {
  const { data, error } = await supabase
    .from('popup_events')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPopupEvent(name: string, startDate: string, endDate: string): Promise<PopupEvent> {
  const { data, error } = await supabase
    .from('popup_events')
    .insert([{ name, start_date: startDate, end_date: endDate }])
    .select()
    .single();
  if (error) throw error;
  return data as PopupEvent;
}

export async function deletePopupEvent(id: number): Promise<void> {
  await supabase.from('schedule_slots').delete().eq('event_id', id);
  const { error } = await supabase.from('popup_events').delete().eq('id', id);
  if (error) throw error;
}

// ── Schedule Slots ────────────────────────────────────────────────────────────

export async function getScheduleByEvent(eventId: number): Promise<ScheduleSlot[]> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addScheduleSlot(
  eventId: number,
  scheduleDate: string,
  role: string,
  personName: string,
  workTime: string,
  workerId?: number,
  breakTime?: boolean
): Promise<ScheduleSlot> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .insert([{
      event_id: eventId,
      schedule_date: scheduleDate,
      role,
      person_name: personName,
      work_time: workTime || null,
      break_time: breakTime ?? false,
      worker_id: workerId ?? null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data as ScheduleSlot;
}

export async function removeScheduleSlot(id: number): Promise<void> {
  const { error } = await supabase.from('schedule_slots').delete().eq('id', id);
  if (error) throw error;
}

export async function updateScheduleSlot(id: number, personName: string, workTime: string, workerId?: number | null, breakTime?: boolean): Promise<ScheduleSlot> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .update({ person_name: personName, work_time: workTime || null, break_time: breakTime ?? false, worker_id: workerId ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ScheduleSlot;
}

export async function copyScheduleSlot(sourceId: number, newDate: string, newRole: string): Promise<ScheduleSlot> {
  const { data: source, error: fetchError } = await supabase
    .from('schedule_slots').select('*').eq('id', sourceId).single();
  if (fetchError) throw fetchError;
  const { data, error } = await supabase
    .from('schedule_slots')
    .insert([{ event_id: source.event_id, schedule_date: newDate, role: newRole, person_name: source.person_name, work_time: source.work_time, break_time: source.break_time ?? false, worker_id: source.worker_id }])
    .select().single();
  if (error) throw error;
  return data as ScheduleSlot;
}

export async function moveScheduleSlot(id: number, newDate: string, newRole: string): Promise<ScheduleSlot> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .update({ schedule_date: newDate, role: newRole, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ScheduleSlot;
}

// ── Memos ─────────────────────────────────────────────────────────────────────

export async function getAllMemos(): Promise<Memo[]> {
  const { data, error } = await supabase
    .from('memos')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createMemo(title: string, content: string, color: string): Promise<Memo> {
  const { data, error } = await supabase
    .from('memos')
    .insert([{ title: title || null, content, color: color || '#fff9c4' }])
    .select()
    .single();
  if (error) throw error;
  return data as Memo;
}

export async function updateMemo(id: number, title: string, content: string, color: string): Promise<Memo> {
  const { data, error } = await supabase
    .from('memos')
    .update({ title: title || null, content, color: color || '#fff9c4', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Memo;
}

export async function deleteMemo(id: number): Promise<void> {
  const { error } = await supabase.from('memos').delete().eq('id', id);
  if (error) throw error;
}

// ── Menu Sales ────────────────────────────────────────────────────────────────

export async function getMenuSalesByPeriod(startISO: string, endISO: string): Promise<MenuSalesItem[]> {
  const PAGE_SIZE = 1000;
  const allOrderIds: number[] = [];
  let from = 0;

  while (true) {
    const { data, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .range(from, from + PAGE_SIZE - 1);

    if (ordersError) throw ordersError;
    if (!data || data.length === 0) break;
    allOrderIds.push(...data.map((o) => o.id as number));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (allOrderIds.length === 0) return [];

  const orderIds = allOrderIds;

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('quantity, subtotal, menu_item_id, menu_items(id, name, price, color)')
    .in('order_id', orderIds)
    .limit(100000);

  if (itemsError) throw itemsError;

  const menuMap: Record<number, MenuSalesItem> = {};

  for (const item of items ?? []) {
    const menuId = item.menu_item_id as number;
    const menuInfo = item.menu_items as unknown as { id: number; name: string; price: number; color: string } | null;
    if (!menuMap[menuId]) {
      menuMap[menuId] = {
        id: menuId,
        name: menuInfo?.name ?? '삭제된 메뉴',
        price: menuInfo?.price ?? 0,
        color: menuInfo?.color ?? '#ccc',
        totalQuantity: 0,
        totalRevenue: 0,
      };
    }
    menuMap[menuId].totalQuantity += item.quantity as number;
    menuMap[menuId].totalRevenue += Number(item.subtotal);
  }

  return Object.values(menuMap).sort((a, b) => b.totalQuantity - a.totalQuantity);
}

// ── Workers ───────────────────────────────────────────────────────────────────

export interface WorkerInput {
  event_id: number;
  name: string;
  color?: string;
  phone?: string;
  bank_name?: string;
  bank_account?: string;
  hourly_rate?: number;
}

export async function getWorkers(eventId: number): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('event_id', eventId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createWorker(input: WorkerInput): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .insert([{ event_id: input.event_id, name: input.name, color: input.color || '#6366f1', phone: input.phone || null, bank_name: input.bank_name || null, bank_account: input.bank_account || null, hourly_rate: input.hourly_rate ?? 0 }])
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function updateWorker(id: number, input: WorkerInput): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .update({ name: input.name, color: input.color || '#6366f1', phone: input.phone || null, bank_name: input.bank_name || null, bank_account: input.bank_account || null, hourly_rate: input.hourly_rate ?? 0, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function deleteWorker(id: number): Promise<void> {
  const { error } = await supabase.from('workers').delete().eq('id', id);
  if (error) throw error;
}

export async function setWorkerPaymentDone(id: number, done: boolean): Promise<Worker> {
  const { data, error } = await supabase
    .from('workers')
    .update({ payment_done: done, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}
