'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchTodaysSales,
  fetchMenuSalesBreakdown,
  fetchTodaysOrders,
  resetTodaysSales,
  fetchMonthlySalesCalendar,
} from '@/app/actions';
import type { TodaysSales, MenuSalesItem, CalendarSalesData, OrderRecord } from '@/types/api';
import { toLocalDateStr, formatPrice } from '@/lib/utils';

type Period = 'today' | 'week' | 'month';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
];

function getPeriodBounds(period: Period): { startISO: string; endISO: string; label: string } {
  const now = new Date();
  const todayStr = toLocalDateStr(now);

  if (period === 'today') {
    return { startISO: `${todayStr}T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '오늘' };
  }

  if (period === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return { startISO: `${toLocalDateStr(monday)}T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '이번 주' };
  }

  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { startISO: `${monthStr}-01T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '이번 달' };
}

function getCellBgStyle(revenue: number, maxRevenue: number) {
  if (revenue <= 0 || maxRevenue <= 0) return { backgroundColor: '#f8faf9' };
  const ratio = Math.min(revenue / maxRevenue, 1);
  // #e6f4ee (primary-50) → #3d9966 (medium brand green)
  const r = Math.round(230 + (61 - 230) * ratio);
  const g = Math.round(244 + (153 - 244) * ratio);
  const b = Math.round(238 + (102 - 238) * ratio);
  return { backgroundColor: `rgb(${r},${g},${b})` };
}

export default function StatsPage() {
  const today = new Date();
  const todayStr = toLocalDateStr(today);

  const [summary, setSummary] = useState<TodaysSales>({ totalOrders: 0, totalRevenue: 0 });
  const [breakdown, setBreakdown] = useState<MenuSalesItem[]>([]);
  const [breakdownPeriod, setBreakdownPeriod] = useState<Period>('today');
  const [todayOrders, setTodayOrders] = useState<OrderRecord[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calendarSales, setCalendarSales] = useState<CalendarSalesData>({ byDate: {}, monthTotal: 0, totalOrders: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isResettingSales, setIsResettingSales] = useState(false);
  const [materialCost, setMaterialCost] = useState(0);
  const [otherCost, setOtherCost] = useState(0);

  const loadTodayData = async () => {
    setIsLoading(true);
    const [summaryResult, ordersResult] = await Promise.all([fetchTodaysSales(), fetchTodaysOrders()]);
    if (summaryResult.success && summaryResult.data) setSummary(summaryResult.data);
    if (ordersResult.success && ordersResult.data) setTodayOrders(ordersResult.data);
    setIsLoading(false);
  };

  const loadBreakdown = async (period: Period) => {
    setIsBreakdownLoading(true);
    const { startISO, endISO } = getPeriodBounds(period);
    const result = await fetchMenuSalesBreakdown(startISO, endISO);
    setBreakdown(result.success && result.data ? result.data : []);
    setIsBreakdownLoading(false);
  };

  const loadMonthlyCalendar = async (dateCursor: Date) => {
    setIsCalendarLoading(true);
    const result = await fetchMonthlySalesCalendar(dateCursor.getFullYear(), dateCursor.getMonth() + 1);
    if (result.success && result.data) setCalendarSales(result.data);
    setIsCalendarLoading(false);
  };

  useEffect(() => { loadTodayData(); }, []);
  useEffect(() => { loadMonthlyCalendar(calendarMonth); }, [calendarMonth]);
  useEffect(() => { loadBreakdown(breakdownPeriod); }, [breakdownPeriod]);

  const handleResetTodaysSales = async () => {
    if (todayOrders.length === 0) { toast.warning('오늘 삭제할 매출이 없습니다'); return; }

    const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
    if (!window.confirm(`정말 오늘 매출(${todayOrders.length}건, ₩${todayRevenue.toLocaleString('ko-KR')})을 모두 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    if (window.prompt('안전 확인: "초기화"를 정확히 입력하면 오늘 매출이 전부 삭제됩니다.') !== '초기화') {
      toast.error('초기화가 취소되었습니다. 확인 문구가 일치하지 않습니다.');
      return;
    }

    setIsResettingSales(true);
    const result = await resetTodaysSales();
    if (result.success) {
      toast.success(`오늘 매출 ${result.deletedCount ?? 0}건이 초기화되었습니다.`);
      await loadTodayData();
    } else {
      toast.error(`오류: ${result.error}`);
    }
    setIsResettingSales(false);
  };

  const moveCalendarMonth = (offset: number) =>
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));

  const monthYearLabel = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
  const maxQuantity = breakdown.length > 0 ? breakdown[0].totalQuantity : 1;
  const maxDayRevenue = Math.max(...Object.values(calendarSales.byDate || {}).map(Number), 1);

  const buildDateKey = (year: number, monthIndex: number, day: number) =>
    `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const afterFee = Math.round(calendarSales.monthTotal * 0.68);
  const estimatedSettlement = afterFee - materialCost - otherCost;

  const handleCostChange = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setter(raw ? parseInt(raw, 10) : 0);
  };

  const formatCostDisplay = (val: number) => val === 0 ? '' : val.toLocaleString('ko-KR');

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="bg-white rounded-2xl p-4 md:p-5 max-w-[800px] mx-auto">
          <h2 className="m-0 mb-5 text-2xl font-extrabold">매출</h2>

          {/* 오늘 요약 */}
          <div className="mb-4 md:mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="m-0 text-lg font-bold">오늘 매출 요약</h3>
              <button className="border-none bg-primary-700 text-white rounded-lg px-3 py-2 text-[13px] font-semibold cursor-pointer transition hover:bg-primary-800 disabled:opacity-60 disabled:cursor-not-allowed" onClick={loadTodayData} disabled={isLoading}>
                {isLoading ? '불러오는 중...' : '새로고침'}
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 bg-[#f9f9f9] rounded-xl p-3.5 md:p-4 border border-[#eee] flex flex-col gap-1">
                <span className="text-[13px] text-[#666] font-semibold">총 주문</span>
                <strong className="text-2xl font-extrabold text-[#161616]">{summary.totalOrders}건</strong>
              </div>
              <div className="flex-1 bg-primary-50 rounded-xl p-3.5 md:p-4 border border-primary-700 flex flex-col gap-1">
                <span className="text-[13px] text-[#666] font-semibold">총 매출</span>
                <strong className="text-2xl font-extrabold text-primary-700">₩{formatPrice(summary.totalRevenue)}</strong>
              </div>
            </div>
          </div>

          {/* 메뉴별 판매 현황 */}
          <div className="mb-4 md:mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="m-0 text-lg font-bold">메뉴별 판매 현황 ({getPeriodBounds(breakdownPeriod).label})</h3>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PERIODS.map(({ key, label }) => (
                <button key={key} className={`px-3.5 py-1.5 rounded-full border bg-[#f5f6f7] cursor-pointer text-[13px] font-semibold transition-all duration-200 ${breakdownPeriod === key ? 'bg-primary-700 text-white border-primary-700' : 'border-[#ddd] text-[#555] hover:bg-[#eee] hover:border-[#ccc]'}`} onClick={() => setBreakdownPeriod(key)}>
                  {label}
                </button>
              ))}
            </div>
            {isBreakdownLoading ? (
              <p>불러오는 중...</p>
            ) : breakdown.length === 0 ? (
              <p className="m-0 text-[#999] text-sm">해당 기간 판매 내역이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                {breakdown.map((item) => (
                  <li key={item.id} className="bg-white rounded-lg p-2.5 md:p-3 border border-[#eee]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full shrink-0 border-2 border-black/10 inline-block" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-semibold">{item.name}</span>
                    </div>
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2.5">
                      <div className="w-full md:flex-1 h-2 bg-[#eee] rounded-full overflow-hidden order-last md:order-none">
                        <div className="h-full rounded-full transition-[width] duration-400 ease-out min-w-[4px]" style={{ width: `${(item.totalQuantity / maxQuantity) * 100}%`, backgroundColor: item.color }} />
                      </div>
                      <span className="text-[13px] font-bold min-w-[36px] text-right text-[#333] shrink-0">{item.totalQuantity}개</span>
                      <span className="text-[13px] font-bold text-primary-700 min-w-[90px] text-right shrink-0">₩{formatPrice(item.totalRevenue)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 오늘 주문 내역 + 초기화 */}
          <div className="mb-4 md:mb-5">
            <div className="bg-[#f9f9f9] rounded-xl p-4">
              <h3 className="m-0 mb-3 text-lg font-bold">오늘 주문 내역</h3>
              <div className="bg-white rounded-lg p-3 mb-3 border border-[#eee]">
                <p className="m-0 mb-1 text-[#555] text-sm">오늘 총 주문: {todayOrders.length}건</p>
                <strong className="text-xl text-primary-700 font-bold">오늘 총매출: ₩{todayRevenue.toLocaleString('ko-KR')}</strong>
              </div>
              <div className="bg-[#fff4f4] border border-[#ffdddd] rounded-lg p-3 mb-3">
                <p className="m-0 mb-2.5 text-[#8a1f1f] text-[13px] leading-[1.4]">주의: 아래 버튼은 오늘 주문/매출 데이터를 전부 삭제합니다. 되돌릴 수 없습니다.</p>
                <button className="border-none bg-[#c62828] text-white rounded-lg px-3.5 py-2.5 text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-[#b71c1c] disabled:opacity-60 disabled:cursor-not-allowed" onClick={handleResetTodaysSales} disabled={isResettingSales || isLoading || todayOrders.length === 0}>
                  {isResettingSales ? '초기화 중...' : '오늘 매출 전체 초기화'}
                </button>
              </div>
              <div>
                <h4 className="m-0 mb-2 text-sm">주문 내역 (주문번호 / 가격)</h4>
                {isLoading ? (
                  <p>주문 내역을 불러오는 중입니다...</p>
                ) : todayOrders.length === 0 ? (
                  <p className="m-0 text-[#999] text-sm">오늘 주문 내역이 없습니다.</p>
                ) : (
                  <ul className="m-0 p-0 list-none border border-[#ececec] rounded-lg bg-white max-h-[240px] overflow-y-auto">
                    {todayOrders.map((order) => (
                      <li key={order.id} className="flex justify-between items-center p-2.5 md:p-3 border-b border-[#f3f3f3] last:border-b-0 text-sm">
                        <span>주문번호 #{order.id}</span>
                        <strong className="font-bold">₩{Number(order.total_price).toLocaleString('ko-KR')}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* 월별 달력 */}
          <div className="bg-[#f4f7f5] rounded-xl p-4">
            {/* Header */}
            <div className="flex justify-between items-center mb-3">
              <h3 className="m-0 text-lg font-bold">날짜별 매출 프리뷰</h3>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-8 h-8 rounded-lg bg-white border border-[#d8d8d8] flex items-center justify-center cursor-pointer text-[#444] hover:bg-[#f0f0f0] text-lg leading-none font-bold"
                  onClick={() => moveCalendarMonth(-1)}
                >
                  ‹
                </button>
                <strong className="min-w-[108px] text-center text-[13px] font-bold text-[#333]">{monthYearLabel}</strong>
                <button
                  className="w-8 h-8 rounded-lg bg-white border border-[#d8d8d8] flex items-center justify-center cursor-pointer text-[#444] hover:bg-[#f0f0f0] text-lg leading-none font-bold"
                  onClick={() => moveCalendarMonth(1)}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Monthly totals */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-white border border-[#e4e4e4] rounded-xl px-3 py-2.5 text-center">
                <div className="text-[11px] text-[#888] font-medium mb-0.5">월 주문</div>
                <div className="text-[17px] font-extrabold text-[#333]">{calendarSales.totalOrders}<span className="text-[13px] font-semibold ml-0.5">건</span></div>
              </div>
              <div className="bg-primary-50 border border-primary-700 rounded-xl px-3 py-2.5 text-center">
                <div className="text-[11px] text-[#888] font-medium mb-0.5">월 매출</div>
                <div className="text-[17px] font-extrabold text-primary-700">₩{formatPrice(calendarSales.monthTotal)}</div>
              </div>
            </div>

            {isCalendarLoading ? (
              <div className="py-10 text-center text-[#999] text-sm">달력 매출을 불러오는 중입니다...</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {/* Day name headers */}
                {['일', '월', '화', '수', '목', '금', '토'].map((name, i) => (
                  <div
                    key={name}
                    className={`text-center text-[11px] font-bold py-1.5 ${
                      i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-[#888]'
                    }`}
                  >
                    {name}
                  </div>
                ))}

                {/* Leading blank cells */}
                {Array.from({ length: firstDay }).map((_, idx) => (
                  <div key={`blank-${idx}`} className="min-h-[64px]" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dayOfWeek = (firstDay + idx) % 7;
                  const dateKey = buildDateKey(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                  const dayRevenue = Number(calendarSales.byDate?.[dateKey] || 0);
                  const isToday = dateKey === todayStr;

                  return (
                    <div
                      key={dateKey}
                      className="min-h-[64px] rounded-lg p-1.5 transition-shadow"
                      style={{
                        ...getCellBgStyle(dayRevenue, maxDayRevenue),
                        border: isToday
                          ? '2px solid #084431'
                          : '1px solid #dce8e0',
                      }}
                    >
                      <div
                        className={`text-[11px] font-extrabold leading-none ${
                          dayOfWeek === 0
                            ? 'text-red-500'
                            : dayOfWeek === 6
                              ? 'text-blue-500'
                              : isToday
                                ? 'text-primary-700'
                                : 'text-[#444]'
                        }`}
                      >
                        {day}
                        {isToday && <span className="ml-0.5 text-primary-700">•</span>}
                      </div>
                      <div
                        className={`mt-1.5 text-[10px] font-semibold leading-tight ${
                          dayRevenue > 0 ? 'text-[#1a3d2b]' : 'text-[#ccc]'
                        }`}
                      >
                        {dayRevenue > 0 ? `₩${formatPrice(dayRevenue)}` : '·'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 정산 계산기 */}
            <div className="mt-4 bg-white border border-[#dce8e0] rounded-xl overflow-hidden">
              <div className="bg-primary-700 px-4 py-3">
                <h4 className="m-0 text-[14px] font-bold text-white">{monthYearLabel} 예상 정산 계산기</h4>
              </div>
              <div className="px-4 py-1">
                <div className="flex items-center justify-between py-3 border-b border-[#f0f0f0]">
                  <span className="text-sm text-[#555]">최종 월매출</span>
                  <strong className="text-sm font-bold text-[#111]">₩{formatPrice(calendarSales.monthTotal)}</strong>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-[#f0f0f0]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm text-[#555]">팝업 수수료 32% 제외</span>
                    <span className="text-[11px] text-[#aaa]">×68%</span>
                  </div>
                  <strong className="text-sm font-bold text-primary-700">₩{formatPrice(afterFee)}</strong>
                </div>
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f0f0f0]">
                  <span className="text-sm text-[#555] shrink-0">재료비</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] text-[#aaa]">₩</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCostDisplay(materialCost)}
                      onChange={handleCostChange(setMaterialCost)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-28 md:w-36 text-right text-sm border border-[#ddd] rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-[#fafafa]"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 py-3 border-b border-[#f0f0f0]">
                  <span className="text-sm text-[#555] shrink-0">기타</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] text-[#aaa]">₩</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCostDisplay(otherCost)}
                      onChange={handleCostChange(setOtherCost)}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-28 md:w-36 text-right text-sm border border-[#ddd] rounded-lg px-2.5 py-1.5 outline-none focus:border-primary-700 focus:ring-1 focus:ring-primary-700/20 bg-[#fafafa]"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between py-4">
                  <span className="text-[15px] font-extrabold text-[#111]">예상 정산금액</span>
                  <strong className={`text-[15px] font-extrabold ${estimatedSettlement >= 0 ? 'text-primary-700' : 'text-red-600'}`}>
                    {estimatedSettlement < 0 && '-'}₩{formatPrice(Math.abs(estimatedSettlement))}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
