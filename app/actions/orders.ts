'use server';

import { z } from 'zod';
import { wrap, extractErrorMessage } from './_base';
import {
  createOrder,
  getTodaysSales,
  getTodaysOrderList,
  getTodaysOrderListWithItems,
  getPendingOrders,
  prepareOrder,
  deleteOrder,
  getOrdersByPeriod,
  clearTodaysOrders,
  deductForOrder,
} from '@/lib/supabase-admin';
import type { OrderItemInput } from '@/lib/supabase';
import type {
  ApiResponse,
  SaveOrderResponse,
  ResetSalesResponse,
  FetchTodaysSalesResponse,
  FetchOrdersResponse,
  FetchOrdersWithItemsResponse,
} from '@/types/api';

const SaveOrderSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    price: z.number().int().positive(),
    count: z.number().int().positive(),
  })).min(1, '주문 항목이 없습니다'),
  totalPrice: z.number().int().positive('총 금액이 올바르지 않습니다'),
});

export async function saveOrder(items: OrderItemInput[], totalPrice: number, cashierName?: string): Promise<SaveOrderResponse> {
  const parsed = SaveOrderSchema.safeParse({ items, totalPrice });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  try {
    console.log(`[saveOrder] Starting order creation. Items: ${items.length}, Total: ${totalPrice}`);
    const order = await createOrder(items, totalPrice, cashierName);
    const sales = await getTodaysSales();

    let inventoryError: string | undefined;
    try {
      console.log(`[saveOrder] Triggering inventory deduction for order ${order.id}`);
      await deductForOrder(order.id);
      console.log(`[saveOrder] Inventory deduction successful for order ${order.id}`);
    } catch (err) {
      inventoryError = extractErrorMessage(err);
      console.error(`[saveOrder] deductForOrder failed for order ${order.id}:`, err);
    }

    return { success: true, orderId: order.id, dailyOrderNumber: sales.totalOrders, sales, inventoryError };
  } catch (error) {
    const msg = extractErrorMessage(error);
    console.error('[saveOrder] Critical failure:', msg);
    return { success: false, error: msg };
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
export async function fetchOrdersByPeriod(startISO: string, endISO: string): Promise<ApiResponse<Array<{ created_at: string; total_price: number }>>> { return wrap(() => getOrdersByPeriod(startISO, endISO)); }
export async function markOrderPrepared(id: number): Promise<ApiResponse> { return wrap(() => prepareOrder(id)); }
export async function removeOrder(id: number): Promise<ApiResponse> { return wrap(() => deleteOrder(id)); }
