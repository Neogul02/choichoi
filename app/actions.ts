'use server';

import { createOrder, getTodaysSales, getTodaysOrderList, getMonthlySalesByDate, clearTodaysOrders, getMenuItems, addMenuItem, updateMenuItem, deleteMenuItem, getAllMenuItems, updateMenuOrder, getMenuSalesByPeriod, getPopupEvents, createPopupEvent, deletePopupEvent, getScheduleByEvent, addScheduleSlot, removeScheduleSlot, moveScheduleSlot, getAllMemos, createMemo, updateMemo, deleteMemo } from '@/lib/supabase';

export async function saveOrder(items, totalPrice) {
  try {
    const order = await createOrder(items, totalPrice);
    const sales = await getTodaysSales();
    return {
      success: true,
      orderId: order.id,
      sales: sales,
    };
  } catch (error) {
    console.error('Order save failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchTodaysSales() {
  try {
    const sales = await getTodaysSales();
    return {
      success: true,
      data: sales,
    };
  } catch (error) {
    console.error('Failed to fetch sales:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchMenuItems() {
  try {
    const items = await getMenuItems();
    return {
      success: true,
      data: items,
    };
  } catch (error) {
    console.error('Failed to fetch menu:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getAllMenu() {
  try {
    const items = await getAllMenuItems();
    return {
      success: true,
      data: items,
    };
  } catch (error) {
    console.error('Failed to fetch all menu:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function createNewMenuItem(name, price, color) {
  try {
    const item = await addMenuItem(name, price, color);
    return {
      success: true,
      data: item,
    };
  } catch (error) {
    console.error('Failed to create menu item:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function editMenuItem(id, name, price, color) {
  try {
    const item = await updateMenuItem(id, name, price, color);
    return {
      success: true,
      data: item,
    };
  } catch (error) {
    console.error('Failed to update menu item:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function removeMenuItem(id) {
  try {
    await deleteMenuItem(id);
    return {
      success: true,
    };
  } catch (error) {
    console.error('Failed to delete menu item:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function reorderMenuItems(orderedIds) {
  try {
    await updateMenuOrder(orderedIds);
    return {
      success: true,
    };
  } catch (error) {
    console.error('Failed to reorder menu items:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchTodaysOrders() {
  try {
    const orders = await getTodaysOrderList();
    return {
      success: true,
      data: orders,
    };
  } catch (error) {
    console.error('Failed to fetch today orders:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function resetTodaysSales() {
  try {
    const result = await clearTodaysOrders();
    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    console.error('Failed to reset today sales:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchMonthlySalesCalendar(year, month) {
  try {
    const calendar = await getMonthlySalesByDate(year, month);
    return {
      success: true,
      data: calendar,
    };
  } catch (error) {
    console.error('Failed to fetch monthly sales calendar:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchMenuSalesBreakdown(startISO, endISO) {
  try {
    const data = await getMenuSalesByPeriod(startISO, endISO);
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Failed to fetch menu sales breakdown:', error);
    return {
      success: false,
      error: error.message,
      data: [],
    };
  }
}

// ── Popup Event actions ───────────────────────────────────────────────────────

export async function fetchPopupEvents() {
  try {
    const data = await getPopupEvents();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch popup events:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function createNewPopupEvent(name: string, startDate: string, endDate: string) {
  try {
    const data = await createPopupEvent(name, startDate, endDate);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create popup event:', error);
    return { success: false, error: error.message };
  }
}

export async function removePopupEvent(id: number) {
  try {
    await deletePopupEvent(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete popup event:', error);
    return { success: false, error: error.message };
  }
}

// ── Schedule Slot actions ─────────────────────────────────────────────────────

export async function fetchScheduleByEvent(eventId: number) {
  try {
    const data = await getScheduleByEvent(eventId);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch schedule:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function addScheduleEntry(eventId: number, scheduleDate: string, role: string, personName: string, workTime: string) {
  try {
    const data = await addScheduleSlot(eventId, scheduleDate, role, personName, workTime);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to add schedule entry:', error);
    return { success: false, error: error.message };
  }
}

export async function removeScheduleEntry(id: number) {
  try {
    await removeScheduleSlot(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove schedule entry:', error);
    return { success: false, error: error.message };
  }
}

export async function moveScheduleEntry(id: number, newDate: string, newRole: string) {
  try {
    const data = await moveScheduleSlot(id, newDate, newRole);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to move schedule entry:', error);
    return { success: false, error: error.message };
  }
}

// ── Memo actions ──────────────────────────────────────────────────────────────

export async function fetchAllMemos() {
  try {
    const data = await getAllMemos();
    return { success: true, data };
  } catch (error) {
    console.error('Failed to fetch memos:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function createNewMemo(title: string, content: string, color: string) {
  try {
    const data = await createMemo(title, content, color);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to create memo:', error);
    return { success: false, error: error.message };
  }
}

export async function editMemo(id: number, title: string, content: string, color: string) {
  try {
    const data = await updateMemo(id, title, content, color);
    return { success: true, data };
  } catch (error) {
    console.error('Failed to edit memo:', error);
    return { success: false, error: error.message };
  }
}

export async function removeMemo(id: number) {
  try {
    await deleteMemo(id);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove memo:', error);
    return { success: false, error: error.message };
  }
}
