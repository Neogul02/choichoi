'use server';

import axios from 'axios';
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
  getOrdersByPeriod,
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
  deductForOrder,
  getIngredients,
  addRestock,
  physicalInventory,
  getRecipesWithIngredients,
  upsertRecipe,
  deleteRecipe,
  getRecentDeductions,
  getRecentOrderLogs,
  updateIngredientMeta,
  addIngredient,
  deleteIngredient,
  upsertDailySales,
  getDailySalesForMonth,
  deleteDailySales,
  getDailySalesByDate,
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
  FetchIngredientsResponse,
  FetchRecipesResponse,
  FetchDeductionEventsResponse,
  FetchManualSalesResponse,
} from '@/types/api';
import type { MenuItem, Memo, ScheduleSlot, PopupEvent, Worker, Ingredient } from '@/types/database';

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
    console.log(`[saveOrder] Starting order creation. Items: ${items.length}, Total: ${totalPrice}`);
    const order = await createOrder(items, totalPrice, cashierName);
    
    // Fetch updated sales summary for the POS UI
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
    
    return { 
      success: true, 
      orderId: order.id, 
      dailyOrderNumber: sales.totalOrders, 
      sales, 
      inventoryError 
    };
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
export async function saveManualSales(saleDate: string, totalRevenue: number, totalOrders: number, note: string | null): Promise<ApiResponse> { return wrap(() => upsertDailySales(saleDate, totalRevenue, totalOrders, note)); }
export async function fetchManualSalesForMonth(year: number, month: number): Promise<FetchManualSalesResponse> { return wrap(() => getDailySalesForMonth(year, month)); }
export async function removeManualSales(id: number): Promise<ApiResponse> { return wrap(() => deleteDailySales(id)); }
export async function fetchManualSalesByDate(saleDate: string): Promise<ApiResponse<import('@/types/api').ManualSalesEntry | null>> { return wrap(() => getDailySalesByDate(saleDate)); }

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

// ── Inventory actions ─────────────────────────────────────────────────────────

export async function fetchIngredients(): Promise<FetchIngredientsResponse> { return wrap(getIngredients); }
export async function fetchRecipes(): Promise<FetchRecipesResponse> { return wrap(getRecipesWithIngredients); }
export async function fetchRecentDeductions(limit?: number): Promise<FetchDeductionEventsResponse> { return wrap(() => getRecentDeductions(limit)); }
export async function fetchRecentOrderLogs(limit?: number): Promise<import('@/types/api').FetchOrderLogsResponse> { return wrap(() => getRecentOrderLogs(limit)); }
export async function restockIngredient(id: string, sealed: number, opened: number, note?: string, by?: string): Promise<ApiResponse> { return wrap(() => addRestock(id, sealed, opened, note, by)); }
export async function setPhysicalInventory(id: string, sealed: number, opened: number): Promise<ApiResponse<Ingredient>> { return wrap(() => physicalInventory(id, sealed, opened)); }
export async function saveRecipe(menu_id: number, ingredient_id: string, qty: number): Promise<ApiResponse> { return wrap(() => upsertRecipe(menu_id, ingredient_id, qty)); }
export async function removeRecipe(menu_id: number, ingredient_id: string): Promise<ApiResponse> { return wrap(() => deleteRecipe(menu_id, ingredient_id)); }
export async function updateIngredientSettings(
  id: string,
  updates: { container_size?: number; reorder_at_containers?: number; vendor?: string }
): Promise<ApiResponse<Ingredient>> { return wrap(() => updateIngredientMeta(id, updates)); }
export async function createIngredient(data: {
  id: string; name: string; category: string; color: string;
  unit_type: 'count' | 'weight'; base_unit: string; container_unit: string;
  container_size: number; reorder_at_containers: number;
}): Promise<ApiResponse<Ingredient>> { return wrap(() => addIngredient(data)); }
export async function deleteIngredientById(id: string): Promise<ApiResponse> { return wrap(() => deleteIngredient(id)); }

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

  const prompt = `당신은 베이커리 POS 시스템의 전문 데이터 분석가입니다.
아래 제공된 판매 데이터를 바탕으로 지정된 포맷에 맞춰 매출 분석 리포트를 작성하세요.

[데이터]
- 총 매출: ₩${totalRevenue.toLocaleString()}
- 총 주문: ${totalOrders}건
- 피크 시간대: ${peakHour.label} (₩${peakHour.revenue.toLocaleString()})
- 시간대별 매출:
${hourList || '  - 데이터 없음'}
- 메뉴별 판매:
${menuList || '  - 데이터 없음'}

[제약 조건]
1. 반드시 아래의 [출력 포맷]을 그대로 사용하여 마크다운으로 출력할 것.
2. 각 항목은 1~2문장으로 간결하게 작성할 것.
3. 제공된 데이터 내에서만 분석하고, 근거 없는 추측은 배제할 것.
4. 인사말이나 부연 설명 없이 지정된 포맷의 텍스트만 출력할 것.

[출력 포맷]
- 💰 전체 흐름: (총 매출과 주문 건수를 바탕으로 한 전반적인 실적 요약)
- 📈 피크 타임: (피크 시간대와 해당 시간대 매출 집중도 분석)
- 🥐 인기 메뉴: (가장 많이 팔린 메뉴와 매출 기여도 분석)
- 💡 개선 제안: (데이터에 기반한 시간대별 인력 배치 또는 재고 준비 관련 실질적 액션 아이템)
`;

  try {
    const { data } = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'X-goog-api-key': apiKey } }
    );
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return { success: false, error: '응답을 받지 못했습니다.' };
    return { success: true, data: text };
  } catch (e) {
    if (axios.isAxiosError(e)) {
      if (e.response?.status === 429) return { success: false, error: 'API 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' };
      return { success: false, error: `Gemini 오류: ${e.response?.status} ${e.response?.data?.error?.message ?? ''}` };
    }
    return { success: false, error: String(e) };
  }
}
