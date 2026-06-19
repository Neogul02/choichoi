'use server';

import { z } from 'zod';
import { wrap } from './_base';
import {
  getMonthlySalesByDate,
  getMenuSalesByPeriod,
  getDailySalesByPeriod,
  upsertDailySales,
  getDailySalesForMonth,
  deleteDailySales,
  getOrdersByDate,
} from '@/lib/supabase-admin';
import type {
  ApiResponse,
  FetchCalendarResponse,
  FetchMenuSalesResponse,
  FetchDailySalesResponse,
  FetchManualSalesResponse,
} from '@/types/api';

const ManualSalesSchema = z.object({
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)'),
  totalRevenue: z.number().int().min(0, '매출은 0 이상이어야 합니다'),
  totalOrders: z.number().int().min(0, '주문 수는 0 이상이어야 합니다'),
  note: z.string().max(200).nullable(),
});

export async function fetchMonthlySalesCalendar(year: number, month: number): Promise<FetchCalendarResponse> { return wrap(() => getMonthlySalesByDate(year, month)); }
export async function fetchMenuSalesBreakdown(startISO: string, endISO: string, popupId?: string | null): Promise<FetchMenuSalesResponse> { return wrap(() => getMenuSalesByPeriod(startISO, endISO, popupId)); }
export async function fetchDailySalesByPeriod(startISO: string, endISO: string, popupId?: string | null): Promise<FetchDailySalesResponse> { return wrap(() => getDailySalesByPeriod(startISO, endISO, popupId)); }

export async function saveManualSales(saleDate: string, totalRevenue: number, totalOrders: number, note: string | null): Promise<ApiResponse> {
  const parsed = ManualSalesSchema.safeParse({ saleDate, totalRevenue, totalOrders, note });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => upsertDailySales(parsed.data.saleDate, parsed.data.totalRevenue, parsed.data.totalOrders, parsed.data.note));
}

export async function fetchManualSalesForMonth(year: number, month: number): Promise<FetchManualSalesResponse> { return wrap(() => getDailySalesForMonth(year, month)); }
export async function fetchManualSalesByDate(date: string): Promise<ApiResponse<import('@/types/api').ManualSalesEntry>> {
  const [y, m] = date.split('-').map(Number);
  const result = await wrap(() => getDailySalesForMonth(y, m));
  if (!result.success) return result as ApiResponse<never>;
  const entry = result.data?.find((e) => e.sale_date === date);
  return { success: true, data: entry };
}
export async function removeManualSales(id: number): Promise<ApiResponse> { return wrap(() => deleteDailySales(id)); }
export async function fetchOrdersByDate(date: string, popupId?: string | null): Promise<ApiResponse<import('@/types/api').OrderRecordWithItems[]>> { return wrap(() => getOrdersByDate(date, popupId)); }

