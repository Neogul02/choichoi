'use server';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

import {
  createOrder,
  getTodaysSales,
  getTodaysOrderList,
  getTodaysOrderListWithItems,
  getPendingOrders,
  prepareOrder,
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
  type OrderItemInput,
  type WorkerInput,
} from '@/lib/supabase';
import type {
  ApiResponse,
  SaveOrderResponse,
  ResetSalesResponse,
  TodaysSales,
  MenuSalesItem,
  CalendarSalesData,
  OrderRecord,
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

export async function saveOrder(items: OrderItemInput[], totalPrice: number, cashierName?: string): Promise<SaveOrderResponse> {
  try {
    const order = await createOrder(items, totalPrice, cashierName);
    const sales = await getTodaysSales();
    return { success: true, orderId: order.id, dailyOrderNumber: sales.totalOrders, sales };
  } catch (error) {
    console.error('Order save failed:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchTodaysSales(): Promise<FetchTodaysSalesResponse> {
  try {
    const sales = await getTodaysSales();
    return { success: true, data: sales };
  } catch (error) {
    console.error('Failed to fetch sales:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchMenuItems(): Promise<FetchMenuItemsResponse> {
  try {
    const items = await getMenuItems();
    return { success: true, data: items };
  } catch (error) {
    console.error('Failed to fetch menu:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getAllMenu(): Promise<FetchMenuItemsResponse> {
  try {
    const items = await getAllMenuItems();
    return { success: true, data: items };
  } catch (error) {
    console.error('Failed to fetch all menu:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function createNewMenuItem(name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  try {
    const item = await addMenuItem(name, price, color);
    return { success: true, data: item };
  } catch (error) {
    console.error('Failed to create menu item:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function editMenuItem(id: number, name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  try {
    const item = await updateMenuItem(id, name, price, color);
    return { success: true, data: item };
  } catch (error) {
    console.error('Failed to update menu item:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function removeMenuItem(id: number): Promise<ApiResponse> {
  try {
    await deleteMenuItem(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function reorderMenuItems(orderedIds: number[]): Promise<ApiResponse> {
  try {
    await updateMenuOrder(orderedIds);
    return { success: true };
  } catch (error) {
    console.error('Failed to reorder menu items:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchPendingOrders(): Promise<FetchOrdersWithItemsResponse> {
  try {
    const data = await getPendingOrders();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch pending orders:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function markOrderPrepared(id: number): Promise<ApiResponse> {
  try {
    await prepareOrder(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to mark order prepared:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchTodaysOrders(): Promise<FetchOrdersResponse> {
  try {
    const orders = await getTodaysOrderList();
    return { success: true, data: orders };
  } catch (error) {
    console.error('Failed to fetch today orders:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchTodaysOrdersWithItems(limit?: number): Promise<FetchOrdersWithItemsResponse> {
  try {
    const orders = await getTodaysOrderListWithItems(limit);
    return { success: true, data: orders };
  } catch (error) {
    console.error('Failed to fetch today orders with items:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function resetTodaysSales(): Promise<ResetSalesResponse> {
  try {
    const result = await clearTodaysOrders();
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    console.error('Failed to reset today sales:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchMonthlySalesCalendar(year: number, month: number): Promise<FetchCalendarResponse> {
  try {
    const calendar = await getMonthlySalesByDate(year, month);
    return { success: true, data: calendar };
  } catch (error) {
    console.error('Failed to fetch monthly sales calendar:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function fetchMenuSalesBreakdown(startISO: string, endISO: string): Promise<FetchMenuSalesResponse> {
  try {
    const data = await getMenuSalesByPeriod(startISO, endISO);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch menu sales breakdown:', error);
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
}

export async function fetchDailySalesByPeriod(startISO: string, endISO: string): Promise<FetchDailySalesResponse> {
  try {
    const data = await getDailySalesByPeriod(startISO, endISO);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch daily sales by period:', error);
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
}

// ── Popup Event actions ───────────────────────────────────────────────────────

export async function fetchPopupEvents(): Promise<FetchEventsResponse> {
  try {
    const data = await getPopupEvents();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch popup events:', error);
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
}

export async function createNewPopupEvent(name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  try {
    const data = await createPopupEvent(name, startDate, endDate);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create popup event:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function removePopupEvent(id: number): Promise<ApiResponse> {
  try {
    await deletePopupEvent(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete popup event:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

// ── Schedule Slot actions ─────────────────────────────────────────────────────

export async function fetchScheduleByEvent(eventId: number): Promise<FetchSlotsResponse> {
  try {
    const data = await getScheduleByEvent(eventId);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch schedule:', error);
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
}

export async function addScheduleEntry(
  eventId: number,
  scheduleDate: string,
  role: string,
  personName: string,
  workTime: string,
  workerId?: number,
  breakTime?: boolean
): Promise<ApiResponse<ScheduleSlot>> {
  try {
    const data = await addScheduleSlot(eventId, scheduleDate, role, personName, workTime, workerId, breakTime);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to add schedule entry:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function removeScheduleEntry(id: number): Promise<ApiResponse> {
  try {
    await removeScheduleSlot(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove schedule entry:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function moveScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> {
  try {
    const data = await moveScheduleSlot(id, newDate, newRole);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to move schedule entry:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function editScheduleEntry(id: number, personName: string, workTime: string, workerId?: number | null, breakTime?: boolean): Promise<ApiResponse<ScheduleSlot>> {
  try {
    const data = await updateScheduleSlot(id, personName, workTime, workerId, breakTime);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to edit schedule entry:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function copyScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> {
  try {
    const data = await copyScheduleSlot(id, newDate, newRole);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to copy schedule entry:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

// ── Worker actions ────────────────────────────────────────────────────────────

export async function fetchWorkers(eventId: number): Promise<FetchWorkersResponse> {
  try {
    const data = await getWorkers(eventId);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch workers:', error);
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
}

export async function createNewWorker(input: WorkerInput): Promise<ApiResponse<Worker>> {
  try {
    const data = await createWorker(input);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create worker:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function editWorker(id: number, input: WorkerInput): Promise<ApiResponse<Worker>> {
  try {
    const data = await updateWorker(id, input);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to edit worker:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function removeWorker(id: number): Promise<ApiResponse> {
  try {
    await deleteWorker(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove worker:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function markWorkerPayment(id: number, done: boolean): Promise<ApiResponse<Worker>> {
  try {
    const data = await setWorkerPaymentDone(id, done);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to update payment status:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

// ── Memo actions ──────────────────────────────────────────────────────────────

export async function fetchAllMemos(): Promise<FetchMemosResponse> {
  try {
    const data = await getAllMemos();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch memos:', error);
    return { success: false, error: extractErrorMessage(error), data: [] };
  }
}

export async function createNewMemo(title: string, content: string, color: string): Promise<ApiResponse<Memo>> {
  try {
    const data = await createMemo(title, content, color);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create memo:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function editMemo(id: number, title: string, content: string, color: string): Promise<ApiResponse<Memo>> {
  try {
    const data = await updateMemo(id, title, content, color);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to edit memo:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function removeMemo(id: number): Promise<ApiResponse> {
  try {
    await deleteMemo(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove memo:', error);
    return { success: false, error: extractErrorMessage(error) };
  }
}
