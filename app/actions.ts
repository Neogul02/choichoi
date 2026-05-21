'use server';

import {
  createOrder,
  getTodaysSales,
  getTodaysOrderList,
  getTodaysOrderListWithItems,
  getPendingOrders,
  prepareOrder,
  deleteOrder,
  getMonthlySalesByDate,
  clearTodaysOrders,
  getMenuItems,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  updateMenuOrder,
  getMenuSalesByPeriod,
  getDailySalesByPeriod,
  getPopupEvents,
  createPopupEvent,
  deletePopupEvent,
  getScheduleByEvent,
  addScheduleSlot,
  removeScheduleSlot,
  moveScheduleSlot,
  updateScheduleSlot,
  copyScheduleSlot,
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  setWorkerPaymentDone,
  getAllMemos,
  createMemo,
  updateMemo,
  deleteMemo,
} from '@/lib/supabase-admin';
import type { OrderItemInput, WorkerInput } from '@/lib/supabase';
import type {
  ApiResponse,
  SaveOrderResponse,
  ResetSalesResponse,
  FetchMenuItemsResponse,
  FetchTodaysSalesResponse,
  FetchMenuSalesResponse,
  FetchCalendarResponse,
  FetchOrdersResponse,
  FetchOrdersWithItemsResponse,
  FetchMemosResponse,
  FetchSlotsResponse,
  FetchEventsResponse,
  FetchWorkersResponse,
  FetchDailySalesResponse,
} from '@/types/api';
import type { MenuItem, Memo, ScheduleSlot, PopupEvent, Worker } from '@/types/database';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    return { success: false, error: extractErrorMessage(e) };
  }
}

// ── Order actions ─────────────────────────────────────────────────────────────

export async function saveOrder(items: OrderItemInput[], totalPrice: number, cashierName?: string): Promise<SaveOrderResponse> {
  try {
    const order = await createOrder(items, totalPrice, cashierName);
    const sales = await getTodaysSales();
    return { success: true, orderId: order.id, dailyOrderNumber: sales.totalOrders, sales };
  } catch (error) {
    return { success: false, error: extractErrorMessage(error) };
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

export async function fetchTodaysSales(): Promise<FetchTodaysSalesResponse> { return wrap(getTodaysSales); }
export async function fetchTodaysOrders(): Promise<FetchOrdersResponse> { return wrap(getTodaysOrderList); }
export async function fetchTodaysOrdersWithItems(limit?: number): Promise<FetchOrdersWithItemsResponse> { return wrap(() => getTodaysOrderListWithItems(limit)); }
export async function fetchPendingOrders(): Promise<FetchOrdersWithItemsResponse> { return wrap(getPendingOrders); }
export async function markOrderPrepared(id: number): Promise<ApiResponse> { return wrap(() => prepareOrder(id)); }
export async function removeOrder(id: number): Promise<ApiResponse> { return wrap(() => deleteOrder(id)); }

// ── Menu actions ──────────────────────────────────────────────────────────────

export async function fetchMenuItems(): Promise<FetchMenuItemsResponse> { return wrap(getMenuItems); }
export async function getAllMenu(): Promise<FetchMenuItemsResponse> { return wrap(getAllMenuItems); }
export async function createNewMenuItem(name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> { return wrap(() => addMenuItem(name, price, color)); }
export async function editMenuItem(id: number, name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> { return wrap(() => updateMenuItem(id, name, price, color)); }
export async function removeMenuItem(id: number): Promise<ApiResponse> { return wrap(() => deleteMenuItem(id)); }
export async function reorderMenuItems(orderedIds: number[]): Promise<ApiResponse> { return wrap(() => updateMenuOrder(orderedIds)); }

// ── Stats actions ─────────────────────────────────────────────────────────────

export async function fetchMonthlySalesCalendar(year: number, month: number): Promise<FetchCalendarResponse> { return wrap(() => getMonthlySalesByDate(year, month)); }
export async function fetchMenuSalesBreakdown(startISO: string, endISO: string): Promise<FetchMenuSalesResponse> { return wrap(() => getMenuSalesByPeriod(startISO, endISO)); }
export async function fetchDailySalesByPeriod(startISO: string, endISO: string): Promise<FetchDailySalesResponse> { return wrap(() => getDailySalesByPeriod(startISO, endISO)); }

// ── Popup Event actions ───────────────────────────────────────────────────────

export async function fetchPopupEvents(): Promise<FetchEventsResponse> { return wrap(getPopupEvents); }
export async function createNewPopupEvent(name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> { return wrap(() => createPopupEvent(name, startDate, endDate)); }
export async function removePopupEvent(id: number): Promise<ApiResponse> { return wrap(() => deletePopupEvent(id)); }

// ── Schedule Slot actions ─────────────────────────────────────────────────────

export async function fetchScheduleByEvent(eventId: number): Promise<FetchSlotsResponse> { return wrap(() => getScheduleByEvent(eventId)); }
export async function addScheduleEntry(eventId: number, scheduleDate: string, role: string, personName: string, workTime: string, workerId?: number, breakTime?: boolean): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => addScheduleSlot(eventId, scheduleDate, role, personName, workTime, workerId, breakTime)); }
export async function removeScheduleEntry(id: number): Promise<ApiResponse> { return wrap(() => removeScheduleSlot(id)); }
export async function moveScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => moveScheduleSlot(id, newDate, newRole)); }
export async function editScheduleEntry(id: number, personName: string, workTime: string, workerId?: number | null, breakTime?: boolean): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => updateScheduleSlot(id, personName, workTime, workerId, breakTime)); }
export async function copyScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => copyScheduleSlot(id, newDate, newRole)); }

// ── Worker actions ────────────────────────────────────────────────────────────

export async function fetchWorkers(eventId: number): Promise<FetchWorkersResponse> { return wrap(() => getWorkers(eventId)); }
export async function createNewWorker(input: WorkerInput): Promise<ApiResponse<Worker>> { return wrap(() => createWorker(input)); }
export async function editWorker(id: number, input: WorkerInput): Promise<ApiResponse<Worker>> { return wrap(() => updateWorker(id, input)); }
export async function removeWorker(id: number): Promise<ApiResponse> { return wrap(() => deleteWorker(id)); }
export async function markWorkerPayment(id: number, done: boolean): Promise<ApiResponse<Worker>> { return wrap(() => setWorkerPaymentDone(id, done)); }

// ── Memo actions ──────────────────────────────────────────────────────────────

export async function fetchAllMemos(): Promise<FetchMemosResponse> { return wrap(getAllMemos); }
export async function createNewMemo(title: string, content: string, color: string): Promise<ApiResponse<Memo>> { return wrap(() => createMemo(title, content, color)); }
export async function editMemo(id: number, title: string, content: string, color: string): Promise<ApiResponse<Memo>> { return wrap(() => updateMemo(id, title, content, color)); }
export async function removeMemo(id: number): Promise<ApiResponse> { return wrap(() => deleteMemo(id)); }
