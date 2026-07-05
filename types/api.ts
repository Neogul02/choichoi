import type { MenuItem, Memo, PopupEvent } from './database';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TodaysSales {
  totalOrders: number;
  totalRevenue: number;
}

export interface SaveOrderResponse {
  success: boolean;
  orderId?: number;
  dailyOrderNumber?: number;
  sales?: TodaysSales;
  error?: string;
  inventoryError?: string;
}

export interface ResetSalesResponse {
  success: boolean;
  deletedCount?: number;
  error?: string;
}

export interface MenuSalesItem {
  id: number;
  name: string;
  price: number;
  color: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface CalendarSalesData {
  byDate: Record<string, number>;
  monthTotal: number;
  totalOrders: number;
  manualByDate: Record<string, ManualSalesEntry>;
}

export interface OrderRecord {
  id: number;
  total_price: number;
  created_at: string;
  payment_status: string;
  cashier_name: string | null;
  is_prepared: boolean;
  popup_name: string | null;
}

export interface OrderItemDetail {
  menu_item_id: number;
  name: string;
  quantity: number;
  subtotal: number;
}

export interface OrderRecordWithItems extends OrderRecord {
  items: OrderItemDetail[];
}

export interface DailySalesItem {
  date: string;
  revenue: number;
  orderCount: number;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface MakeableResult {
  menu_id: number;
  menu_name: string;
  count: number;
  bottleneck: string | null;
}

export interface OrderLogEntry {
  orderId: number;
  createdAt: string;
  menuItems: { name: string; quantity: number }[];
  deductions: { name: string; qty: number; unit: string }[];
}

export type FetchIngredientsResponse = ApiResponse<import('./database').Ingredient[]>;
export type FetchRecipesResponse = ApiResponse<import('./database').Recipe[]>;
export type FetchDeductionEventsResponse = ApiResponse<import('./database').DeductionEvent[]>;
export type FetchOrderLogsResponse = ApiResponse<OrderLogEntry[]>;

export interface ManualSalesEntry {
  id: number;
  sale_date: string;
  total_revenue: number;
  total_orders: number;
  note: string | null;
}

export type FetchManualSalesResponse = ApiResponse<ManualSalesEntry[]>;

export type FetchMenuItemsResponse = ApiResponse<MenuItem[]>;
export type FetchDailySalesResponse = ApiResponse<DailySalesItem[]>;
export type FetchTodaysSalesResponse = ApiResponse<TodaysSales>;
export type FetchMenuSalesResponse = ApiResponse<MenuSalesItem[]>;
export type FetchCalendarResponse = ApiResponse<CalendarSalesData>;
export type FetchOrdersResponse = ApiResponse<OrderRecord[]>;
export type FetchOrdersWithItemsResponse = ApiResponse<OrderRecordWithItems[]>;
export type FetchMemosResponse = ApiResponse<Memo[]>;
export type FetchEventsResponse = ApiResponse<PopupEvent[]>;
