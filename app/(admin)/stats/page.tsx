'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchTodaysSales, fetchMenuSalesBreakdown, fetchTodaysOrdersWithItems,
  resetTodaysSales, fetchMonthlySalesCalendar, fetchPopupEvents, fetchDailySalesByPeriod,
} from '@/app/actions';
import type { TodaysSales, MenuSalesItem, CalendarSalesData, OrderRecordWithItems, DailySalesItem } from '@/types/api';
import type { PopupEvent } from '@/types/database';
import { toLocalDateStr } from '@/lib/utils';
import TodaySummary from './_components/TodaySummary';
import MenuBreakdownSection from './_components/MenuBreakdownSection';
import TodayOrdersSection from './_components/TodayOrdersSection';
import CalendarSection from './_components/CalendarSection';
import PopupStatsSection from './_components/PopupStatsSection';

type Period = 'today' | 'week' | 'month';

function getPeriodBounds(period: Period): { startISO: string; endISO: string; label: string } {
  const now = new Date();
  const todayStr = toLocalDateStr(now);
  if (period === 'today') return { startISO: `${todayStr}T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '오늘' };
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

export default function StatsPage() {
  const today = new Date();
  const todayStr = toLocalDateStr(today);

  const [summary, setSummary] = useState<TodaysSales>({ totalOrders: 0, totalRevenue: 0 });
  const [breakdown, setBreakdown] = useState<MenuSalesItem[]>([]);
  const [breakdownPeriod, setBreakdownPeriod] = useState<Period>('today');
  const [todayOrders, setTodayOrders] = useState<OrderRecordWithItems[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calendarSales, setCalendarSales] = useState<CalendarSalesData>({ byDate: {}, monthTotal: 0, totalOrders: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [isResettingSales, setIsResettingSales] = useState(false);
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([]);
  const [selectedPopupId, setSelectedPopupId] = useState<number | null>(null);
  const [popupMenuBreakdown, setPopupMenuBreakdown] = useState<MenuSalesItem[]>([]);
  const [popupDailySales, setPopupDailySales] = useState<DailySalesItem[]>([]);
  const [isPopupStatsLoading, setIsPopupStatsLoading] = useState(false);

  const loadTodayData = async () => {
    setIsLoading(true);
    const [summaryResult, ordersResult] = await Promise.all([fetchTodaysSales(), fetchTodaysOrdersWithItems()]);
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
  useEffect(() => {
    fetchPopupEvents().then((res) => { if (res.success && res.data) setPopupEvents(res.data); });
  }, []);
  useEffect(() => {
    if (!selectedPopupId) return;
    const popup = popupEvents.find((p) => p.id === selectedPopupId);
    if (!popup) return;
    const startISO = `${popup.start_date}T00:00:00+09:00`;
    const endISO = `${popup.end_date}T23:59:59+09:00`;
    setIsPopupStatsLoading(true);
    Promise.all([fetchMenuSalesBreakdown(startISO, endISO), fetchDailySalesByPeriod(startISO, endISO)]).then(([menuRes, dailyRes]) => {
      setPopupMenuBreakdown(menuRes.success && menuRes.data ? menuRes.data : []);
      setPopupDailySales(dailyRes.success && dailyRes.data ? dailyRes.data : []);
      setIsPopupStatsLoading(false);
    });
  }, [selectedPopupId, popupEvents]);

  const todayRevenue = useMemo(() => todayOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0), [todayOrders]);
  const maxDayRevenue = useMemo(() => Math.max(...Object.values(calendarSales.byDate || {}).map(Number), 1), [calendarSales.byDate]);

  const handleResetTodaysSales = async () => {
    if (todayOrders.length === 0) { toast.warning('오늘 삭제할 매출이 없습니다'); return; }
    if (!window.confirm(`정말 오늘 매출(${todayOrders.length}건, ₩${todayRevenue.toLocaleString('ko-KR')})을 모두 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    if (window.prompt('안전 확인: "초기화"를 정확히 입력하면 오늘 매출이 전부 삭제됩니다.') !== '초기화') { toast.error('초기화가 취소되었습니다. 확인 문구가 일치하지 않습니다.'); return; }
    setIsResettingSales(true);
    const result = await resetTodaysSales();
    if (result.success) { toast.success(`오늘 매출 ${result.deletedCount ?? 0}건이 초기화되었습니다.`); await loadTodayData(); }
    else toast.error(`오류: ${result.error}`);
    setIsResettingSales(false);
  };

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="bg-white rounded-2xl p-4 md:p-5 max-w-[800px] mx-auto">
          <h2 className="m-0 mb-5 text-2xl font-extrabold">매출</h2>
          <TodaySummary summary={summary} isLoading={isLoading} onRefresh={loadTodayData} />
          <MenuBreakdownSection breakdown={breakdown} period={breakdownPeriod} isLoading={isBreakdownLoading} periodLabel={getPeriodBounds(breakdownPeriod).label} onPeriodChange={setBreakdownPeriod} />
          <TodayOrdersSection orders={todayOrders} todayRevenue={todayRevenue} isLoading={isLoading} isResetting={isResettingSales} onReset={handleResetTodaysSales} />
          <CalendarSection calendarSales={calendarSales} calendarMonth={calendarMonth} isLoading={isCalendarLoading} todayStr={todayStr} maxDayRevenue={maxDayRevenue} onMonthChange={(offset) => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1))} />
          <PopupStatsSection popupEvents={popupEvents} selectedPopupId={selectedPopupId} popupMenuBreakdown={popupMenuBreakdown} popupDailySales={popupDailySales} isLoading={isPopupStatsLoading} onSelectPopup={setSelectedPopupId} />
        </div>
      </main>
    </>
  );
}
