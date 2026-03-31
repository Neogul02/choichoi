'use server';

import { createOrder, getTodaysSales, getTodaysOrderList, getMonthlySalesByDate, clearTodaysOrders, getMenuItems, addMenuItem, updateMenuItem, deleteMenuItem, getAllMenuItems, updateMenuOrder } from '@/lib/supabase';

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
