'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { kstToday } from '@/lib/date';
import { useTodayStats } from '../_hooks/useTodayStats';
import { useBreakdown } from '../_hooks/useBreakdown';
import { useCalendar } from '../_hooks/useCalendar';
import { usePopupStats } from '../_hooks/usePopupStats';
import TodaySummary from './TodaySummary';
import TodayOrdersSection from './TodayOrdersSection';
import CalendarSection from './CalendarSection';
import type { TodaysSales, OrderRecordWithItems, MenuSalesItem, CalendarSalesData } from '@/types/api';
import type { PopupEvent } from '@/types/database';

// recharts를 쓰는 차트 섹션들은 지연 로드 — 초기 번들에서 recharts(수백 KB)를 제외
const chartFallback = () => <div className="h-40 rounded-lg bg-canvas-soft animate-pulse" />;
const MenuBreakdownSection = dynamic(() => import('./MenuBreakdownSection'), { ssr: false, loading: chartFallback });
const PopupStatsSection = dynamic(() => import('./PopupStatsSection'), { ssr: false, loading: chartFallback });
const HourlySalesSection = dynamic(() => import('./HourlySalesSection'), { ssr: false, loading: chartFallback });

interface Props {
  initialSummary: TodaysSales | null;
  initialOrders: OrderRecordWithItems[] | null;
  initialBreakdown: MenuSalesItem[] | null;
  initialCalendar: CalendarSalesData | null;
  initialPopupEvents: PopupEvent[] | null;
}

// 초기 데이터는 서버 컴포넌트(page.tsx)가 병렬 조회해 props로 내려준다 — hr 페이지와 동일 패턴
// null인 항목은 각 훅이 기존 경로로 직접 조회한다
export default function StatsPageClient({ initialSummary, initialOrders, initialBreakdown, initialCalendar, initialPopupEvents }: Props) {
  const { summary, todayOrders, isLoading, refresh, handleDeleteOrder } = useTodayStats({ summary: initialSummary, orders: initialOrders });
  const { breakdown, period: breakdownPeriod, isLoading: isBreakdownLoading, periodLabel, setPeriod: setBreakdownPeriod } = useBreakdown(initialBreakdown);
  const { calendarMonth, calendarSales, isLoading: isCalendarLoading, changeMonth, saveDay, removeDay } = useCalendar(initialCalendar);
  const { popupEvents, selectedPopupId, setSelectedPopupId, popupMenuBreakdown, popupDailySales, popupRawOrders, isLoading: isPopupStatsLoading, refreshPopupStats } = usePopupStats(initialPopupEvents);

  const todayStr = kstToday();
  const todayRevenue = useMemo(() => todayOrders.reduce((sum, o) => sum + Number(o.total_price ?? 0), 0), [todayOrders]);

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 lg:p-8 max-w-[1100px] lg:max-w-[1600px] mx-auto">
        <div className="max-w-[800px] lg:max-w-none mx-auto flex flex-col gap-3 md:gap-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
          <h2 className="m-0 px-1 text-heading-1 text-ink lg:col-span-2">통계</h2>

          <div className="lg:col-span-2">
            <TodaySummary summary={summary} isLoading={isLoading} onRefresh={refresh} />
          </div>

          <div className="lg:col-span-2 bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <PopupStatsSection
              popupEvents={popupEvents}
              selectedPopupId={selectedPopupId}
              popupMenuBreakdown={popupMenuBreakdown}
              popupDailySales={popupDailySales}
              popupRawOrders={popupRawOrders}
              isLoading={isPopupStatsLoading}
              onSelectPopup={setSelectedPopupId}
              onRefresh={refreshPopupStats}
            />
          </div>

          <div className="min-w-0 bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <MenuBreakdownSection
              breakdown={breakdown}
              period={breakdownPeriod}
              isLoading={isBreakdownLoading}
              periodLabel={periodLabel}
              onPeriodChange={setBreakdownPeriod}
            />
          </div>

          <div className="min-w-0 bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <HourlySalesSection todayOrders={todayOrders} isLoadingToday={isLoading} popupEvents={popupEvents} />
          </div>

          <TodayOrdersSection
            orders={todayOrders}
            todayRevenue={todayRevenue}
            isLoading={isLoading}
            onDeleteOrder={handleDeleteOrder}
          />

          <CalendarSection
            calendarSales={calendarSales}
            calendarMonth={calendarMonth}
            isLoading={isCalendarLoading}
            todayStr={todayStr}
            onMonthChange={changeMonth}
            saveDay={saveDay}
            removeDay={removeDay}
          />
        </div>
      </main>

    </>
  );
}
