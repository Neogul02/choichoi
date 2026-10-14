import type { MenuItem, PopupEvent } from './database';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TodaysSales {
  totalOrders: number;
  totalRevenue: number;
}

/** 오늘 매출이 난 팝업 한 곳 — POS 매출 배틀용 (매출 내림차순) */
export interface TodayPopupSales {
  popupId: number;
  popupName: string;
  totalRevenue: number;
  totalOrders: number;
  /** KST 시각(0-23)별 그 시간대 매출 — 시간 순. 누적 곡선은 화면에서 더해 그린다 */
  hourly: { hour: number; revenue: number }[];
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

/** 하루 안에서 한 팝업이 올린 POS 매출 — popupId가 null이면 주문에 팝업이 안 붙어 있던 건 */
export interface DayPopupSales {
  popupId: number | null;
  popupName: string;
  revenue: number;
  orders: number;
}

export interface CalendarSalesData {
  byDate: Record<string, number>;
  monthTotal: number;
  totalOrders: number;
  manualByDate: Record<string, ManualSalesEntry>;
  /**
   * 날짜별 팝업 내역 — 매출 내림차순. **POS 주문 기준**이라 수동 입력으로 정정한 날에는
   * byDate(수동값)와 합이 다를 수 있다. 수동 입력은 날짜 단위라 팝업으로 나눌 수 없다.
   */
  popupByDate: Record<string, DayPopupSales[]>;
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
  /** 누적 판매 산도 개수 — 메뉴명에 '산도'가 들어간 품목만 (아이스팩·보냉백 등 부자재 제외) */
  sandoCount: number;
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
export type FetchTodayPopupSalesResponse = ApiResponse<TodayPopupSales[]>;
export type FetchMenuSalesResponse = ApiResponse<MenuSalesItem[]>;
export type FetchCalendarResponse = ApiResponse<CalendarSalesData>;
export type FetchOrdersResponse = ApiResponse<OrderRecord[]>;
export type FetchOrdersWithItemsResponse = ApiResponse<OrderRecordWithItems[]>;
export type FetchEventsResponse = ApiResponse<PopupEvent[]>;
