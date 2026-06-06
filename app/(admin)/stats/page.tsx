'use client';

import { useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import { getKSTDateStr } from './_lib/period';
import { useTodayStats } from './_hooks/useTodayStats';
import { useBreakdown } from './_hooks/useBreakdown';
import { useCalendar } from './_hooks/useCalendar';
import { usePopupStats } from './_hooks/usePopupStats';
import TodaySummary from './_components/TodaySummary';
import MenuBreakdownSection from './_components/MenuBreakdownSection';
import TodayOrdersSection from './_components/TodayOrdersSection';
import CalendarSection from './_components/CalendarSection';
import PopupStatsSection from './_components/PopupStatsSection';
import HourlySalesSection from './_components/HourlySalesSection';

export default function StatsPage() {
  const { summary, todayOrders, isLoading, refresh, handleDeleteOrder } = useTodayStats();
  const { breakdown, period: breakdownPeriod, isLoading: isBreakdownLoading, periodLabel, setPeriod: setBreakdownPeriod } = useBreakdown();
  const { calendarMonth, calendarSales, isLoading: isCalendarLoading, changeMonth } = useCalendar();
  const { popupEvents, selectedPopupId, setSelectedPopupId, popupMenuBreakdown, popupDailySales, isLoading: isPopupStatsLoading } = usePopupStats();

  const todayStr = getKSTDateStr();
  const todayRevenue = useMemo(() => todayOrders.reduce((sum, o) => sum + Number(o.total_price ?? 0), 0), [todayOrders]);
  const maxDayRevenue = useMemo(() => Math.max(...Object.values(calendarSales.byDate ?? {}).map(Number), 1), [calendarSales.byDate]);

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[800px] mx-auto flex flex-col gap-3 md:gap-4">
          <h2 className="m-0 px-1 text-2xl font-extrabold">매출</h2>

          <TodaySummary summary={summary} isLoading={isLoading} onRefresh={refresh} />

          <div className="bg-white rounded-2xl p-4 md:p-5">
            <MenuBreakdownSection
              breakdown={breakdown}
              period={breakdownPeriod}
              isLoading={isBreakdownLoading}
              periodLabel={periodLabel}
              onPeriodChange={setBreakdownPeriod}
            />
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5">
            <HourlySalesSection todayOrders={todayOrders} isLoadingToday={isLoading} popupEvents={popupEvents} />
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5">
            <TodayOrdersSection
              orders={todayOrders}
              todayRevenue={todayRevenue}
              isLoading={isLoading}
              onDeleteOrder={handleDeleteOrder}
            />
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5">
            <CalendarSection
              calendarSales={calendarSales}
              calendarMonth={calendarMonth}
              isLoading={isCalendarLoading}
              todayStr={todayStr}
              maxDayRevenue={maxDayRevenue}
              onMonthChange={changeMonth}
            />
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5">
            <PopupStatsSection
              popupEvents={popupEvents}
              selectedPopupId={selectedPopupId}
              popupMenuBreakdown={popupMenuBreakdown}
              popupDailySales={popupDailySales}
              isLoading={isPopupStatsLoading}
              onSelectPopup={setSelectedPopupId}
            />
          </div>
        </div>
      </main>

    </>
  );
}
