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

// ── AI Analysis actions ───────────────────────────────────────────────────────

interface SalesAnalysisInput {
  totalRevenue: number;
  totalOrders: number;
  hourlyData: Array<{ label: string; revenue: number; orderCount: number }>;
  menuBreakdown: Array<{ name: string; totalQuantity: number; totalRevenue: number }>;
}

export async function fetchAISalesAnalysis(input: SalesAnalysisInput): Promise<ApiResponse<string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: 'API 키가 설정되지 않았습니다.' };

  const { totalRevenue, totalOrders, hourlyData, menuBreakdown } = input;

  const peakHour = hourlyData.reduce((max, d) => (d.revenue > max.revenue ? d : max), hourlyData[0]);
  const activeHours = hourlyData.filter((d) => d.revenue > 0);

  const menuList = menuBreakdown.map((m) => `  - ${m.name}: ${m.totalQuantity}개 / ₩${m.totalRevenue.toLocaleString()}`).join('\n');
  const hourList = activeHours.map((h) => `  - ${h.label}: 주문 ${h.orderCount}건 / ₩${h.revenue.toLocaleString()}`).join('\n');

  const prompt = `아래는 오늘 하루 판매 데이터입니다. 한국어로 간결하게 매출을 분석해주세요. (3~5문장, 이모지 활용, 친근한 말투)

[오늘 요약]
- 총 매출: ₩${totalRevenue.toLocaleString()}
- 총 주문: ${totalOrders}건
- 피크 시간대: ${peakHour.label} (₩${peakHour.revenue.toLocaleString()})

[시간대별 매출]
${hourList || '  - 데이터 없음'}

[메뉴별 판매]
${menuList || '  - 데이터 없음'}

분석 포인트: 피크 시간대, 인기 메뉴, 전체 매출 흐름, 개선 제안 등을 포함해주세요.`;

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!res.ok) {
      if (res.status === 429) return { success: false, error: 'API 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' };
      const err = await res.text();
      return { success: false, error: `Gemini 오류: ${res.status} ${err}` };
    }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return { success: false, error: '응답을 받지 못했습니다.' };
    return { success: true, data: text };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
