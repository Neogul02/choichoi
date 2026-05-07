'use server';

import {
  createOrder,
  getTodaysSales,
  getTodaysOrderList,
  getMonthlySalesByDate,
  clearTodaysOrders,
  getMenuItems,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getAllMenuItems,
  updateMenuOrder,
  getMenuSalesByPeriod,
  getPopupEvents,
  createPopupEvent,
  deletePopupEvent,
  getScheduleByEvent,
  addScheduleSlot,
  removeScheduleSlot,
  moveScheduleSlot,
  getAllMemos,
  createMemo,
  updateMemo,
  deleteMemo,
  type OrderItemInput,
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
  FetchMemosResponse,
  FetchSlotsResponse,
  FetchEventsResponse,
} from '@/types/api';
import type { MenuItem, Memo, ScheduleSlot, PopupEvent } from '@/types/database';

export async function saveOrder(items: OrderItemInput[], totalPrice: number): Promise<SaveOrderResponse> {
  try {
    const order = await createOrder(items, totalPrice);
    const sales = await getTodaysSales();
    return { success: true, orderId: order.id, dailyOrderNumber: order.dailyOrderNumber, sales };
  } catch (error) {
    console.error('Order save failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchTodaysSales(): Promise<FetchTodaysSalesResponse> {
  try {
    const sales = await getTodaysSales();
    return { success: true, data: sales };
  } catch (error) {
    console.error('Failed to fetch sales:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchMenuItems(): Promise<FetchMenuItemsResponse> {
  try {
    const items = await getMenuItems();
    return { success: true, data: items };
  } catch (error) {
    console.error('Failed to fetch menu:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getAllMenu(): Promise<FetchMenuItemsResponse> {
  try {
    const items = await getAllMenuItems();
    return { success: true, data: items };
  } catch (error) {
    console.error('Failed to fetch all menu:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createNewMenuItem(name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  try {
    const item = await addMenuItem(name, price, color);
    return { success: true, data: item };
  } catch (error) {
    console.error('Failed to create menu item:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function editMenuItem(id: number, name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  try {
    const item = await updateMenuItem(id, name, price, color);
    return { success: true, data: item };
  } catch (error) {
    console.error('Failed to update menu item:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function removeMenuItem(id: number): Promise<ApiResponse> {
  try {
    await deleteMenuItem(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function reorderMenuItems(orderedIds: number[]): Promise<ApiResponse> {
  try {
    await updateMenuOrder(orderedIds);
    return { success: true };
  } catch (error) {
    console.error('Failed to reorder menu items:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchTodaysOrders(): Promise<FetchOrdersResponse> {
  try {
    const orders = await getTodaysOrderList();
    return { success: true, data: orders };
  } catch (error) {
    console.error('Failed to fetch today orders:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function resetTodaysSales(): Promise<ResetSalesResponse> {
  try {
    const result = await clearTodaysOrders();
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    console.error('Failed to reset today sales:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchMonthlySalesCalendar(year: number, month: number): Promise<FetchCalendarResponse> {
  try {
    const calendar = await getMonthlySalesByDate(year, month);
    return { success: true, data: calendar };
  } catch (error) {
    console.error('Failed to fetch monthly sales calendar:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchMenuSalesBreakdown(startISO: string, endISO: string): Promise<FetchMenuSalesResponse> {
  try {
    const data = await getMenuSalesByPeriod(startISO, endISO);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch menu sales breakdown:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error), data: [] };
  }
}

// ── Popup Event actions ───────────────────────────────────────────────────────

export async function fetchPopupEvents(): Promise<FetchEventsResponse> {
  try {
    const data = await getPopupEvents();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch popup events:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error), data: [] };
  }
}

export async function createNewPopupEvent(name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  try {
    const data = await createPopupEvent(name, startDate, endDate);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create popup event:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function removePopupEvent(id: number): Promise<ApiResponse> {
  try {
    await deletePopupEvent(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete popup event:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── Schedule Slot actions ─────────────────────────────────────────────────────

export async function fetchScheduleByEvent(eventId: number): Promise<FetchSlotsResponse> {
  try {
    const data = await getScheduleByEvent(eventId);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch schedule:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error), data: [] };
  }
}

export async function addScheduleEntry(
  eventId: number,
  scheduleDate: string,
  role: string,
  personName: string,
  workTime: string
): Promise<ApiResponse<ScheduleSlot>> {
  try {
    const data = await addScheduleSlot(eventId, scheduleDate, role, personName, workTime);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to add schedule entry:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function removeScheduleEntry(id: number): Promise<ApiResponse> {
  try {
    await removeScheduleSlot(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove schedule entry:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function moveScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> {
  try {
    const data = await moveScheduleSlot(id, newDate, newRole);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to move schedule entry:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ── Memo actions ──────────────────────────────────────────────────────────────

export async function fetchAllMemos(): Promise<FetchMemosResponse> {
  try {
    const data = await getAllMemos();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch memos:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error), data: [] };
  }
}

export async function createNewMemo(title: string, content: string, color: string): Promise<ApiResponse<Memo>> {
  try {
    const data = await createMemo(title, content, color);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create memo:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function editMemo(id: number, title: string, content: string, color: string): Promise<ApiResponse<Memo>> {
  try {
    const data = await updateMemo(id, title, content, color);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to edit memo:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function removeMemo(id: number): Promise<ApiResponse> {
  try {
    await deleteMemo(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove memo:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
