'use client';

import { useMemo, useState } from 'react';
import NavBar from '@/components/NavBar';
import { kstToday } from '@/lib/date';
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
  const { calendarMonth, calendarSales, isLoading: isCalendarLoading, changeMonth, saveDay, removeDay } = useCalendar();
  const { popupEvents, selectedPopupId, setSelectedPopupId, popupMenuBreakdown, popupDailySales, popupRawOrders, isLoading: isPopupStatsLoading } = usePopupStats();

  const todayStr = kstToday();
  const todayRevenue = useMemo(() => todayOrders.reduce((sum, o) => sum + Number(o.total_price ?? 0), 0), [todayOrders]);

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[800px] mx-auto flex flex-col gap-3 md:gap-4">
          <h2 className="m-0 px-1 text-heading-1 text-ink">통계</h2>

          <TodaySummary summary={summary} isLoading={isLoading} onRefresh={refresh} />

          <div className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <PopupStatsSection
              popupEvents={popupEvents}
              selectedPopupId={selectedPopupId}
              popupMenuBreakdown={popupMenuBreakdown}
              popupDailySales={popupDailySales}
              popupRawOrders={popupRawOrders}
              isLoading={isPopupStatsLoading}
              onSelectPopup={setSelectedPopupId}
            />
          </div>

          <div className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            <MenuBreakdownSection
              breakdown={breakdown}
              period={breakdownPeriod}
              isLoading={isBreakdownLoading}
              periodLabel={periodLabel}
              onPeriodChange={setBreakdownPeriod}
            />
          </div>

          <div className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
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
