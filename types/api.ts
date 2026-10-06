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

/** 첫 팝업 시작일부터 오늘까지의 누적 집계 — 통계탭 전용 (get_lifetime_sales_totals RPC) */
export interface LifetimeSalesTotals {
  totalRevenue: number;
  totalOrders: number;
  /** 매출이 있었던 날 수 */
  dayCount: number;
  /** YYYY-MM-DD, 데이터가 전혀 없으면 null */
  firstDate: string | null;
  lastDate: string | null;
  popupCount: number;
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

export type FetchIngredientsResponse = ApiResponse<import('./database').Ingredient[]>;
export type FetchStorageBoardResponse = ApiResponse<import('./database').StorageObjectWithItems[]>;

export interface ManualSalesEntry {
  id: number;
  sale_date: string;
  total_revenue: number;
  total_orders: number;
  note: string | null;
}

export type FetchManualSalesResponse = ApiResponse<ManualSalesEntry[]>;

// ── 팝업별 날짜별 메뉴 수기 입력 ─────────────────────────────────────────────────

export interface ManualDailyMenuRow {
  saleDate: string;
  menuItemId: number;
  quantity: number;
}

export type FetchManualDailyMenuSalesResponse = ApiResponse<ManualDailyMenuRow[]>;

// ── 팝업별 시간대 수기 입력 ─────────────────────────────────────────────────────

export interface ManualHourlyEntry {
  hour: number;
  totalRevenue: number;
  totalOrders: number;
}

export type FetchManualHourlySalesResponse = ApiResponse<ManualHourlyEntry[]>;

export type FetchMenuItemsResponse = ApiResponse<MenuItem[]>;
export type FetchDailySalesResponse = ApiResponse<DailySalesItem[]>;
export type FetchTodaysSalesResponse = ApiResponse<TodaysSales>;
export type FetchMenuSalesResponse = ApiResponse<MenuSalesItem[]>;
export type FetchCalendarResponse = ApiResponse<CalendarSalesData>;
export type FetchOrdersResponse = ApiResponse<OrderRecord[]>;
export type FetchOrdersWithItemsResponse = ApiResponse<OrderRecordWithItems[]>;
export type FetchMemosResponse = ApiResponse<Memo[]>;
export type FetchEventsResponse = ApiResponse<PopupEvent[]>;
