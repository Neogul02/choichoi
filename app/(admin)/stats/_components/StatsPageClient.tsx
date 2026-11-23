'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import NavBar from '@/components/NavBar';
import { kstToday } from '@/lib/date';
import { useTodayStats } from '../_hooks/useTodayStats';
import { useCalendar } from '../_hooks/useCalendar';
import { usePopupStats } from '../_hooks/usePopupStats';
import TodaySummary from './TodaySummary';
import TodayOrdersSection from './TodayOrdersSection';
import CalendarSection from './CalendarSection';
import LifetimeTotalCard from './LifetimeTotalCard';
import TodaySection from './TodaySection';
import type { TodaysSales, OrderRecordWithItems, CalendarSalesData, TodayPopupSales } from '@/types/api';
import type { PopupEvent } from '@/types/database';

// recharts를 쓰는 차트 섹션들은 지연 로드 — 초기 번들에서 recharts(수백 KB)를 제외
const chartFallback = () => <div className="h-40 rounded-lg bg-canvas-soft animate-pulse" />;
const PopupStatsSection = dynamic(() => import('./PopupStatsSection'), { ssr: false, loading: chartFallback });

interface Props {
  initialSummary: TodaysSales | null;
  initialOrders: OrderRecordWithItems[] | null;
  initialCalendar: CalendarSalesData | null;
  initialPopupEvents: PopupEvent[] | null;
  /** 오늘 매출이 난 팝업별 집계 — '오늘 현황' 섹션 프리페치 */
  todayPopups: TodayPopupSales[] | null;
}

// 초기 데이터는 서버 컴포넌트(page.tsx)가 병렬 조회해 props로 내려준다 — hr 페이지와 동일 패턴
// null인 항목은 각 훅이 기존 경로로 직접 조회한다
export default function StatsPageClient({ initialSummary, initialOrders, initialCalendar, initialPopupEvents, todayPopups }: Props) {
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const { summary, todayOrders, isLoading, isOrdersLoading, refresh, handleDeleteOrder } = useTodayStats({ summary: initialSummary, orders: initialOrders }, ordersOpen);
  const { calendarMonth, calendarSales, isLoading: isCalendarLoading, changeMonth, refresh: refreshCalendar, saveDay, removeDay } = useCalendar(initialCalendar);
  const { popupEvents, selectedPopupId, setSelectedPopupId, popupMenuBreakdown, popupDailySales, popupRawOrders, manualHourlyEntries, manualDailyHourly, isLoading: isPopupStatsLoading, refreshPopupStats } = usePopupStats(initialPopupEvents, popupOpen);

  const todayStr = kstToday();
  const todayRevenue = useMemo(() => todayOrders.reduce((sum, o) => sum + Number(o.total_price ?? 0), 0), [todayOrders]);

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <div className="max-w-[800px] lg:max-w-none mx-auto flex flex-col gap-3 md:gap-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
          {/* ① 오늘 — 매출 카드 + 오늘 현황(팝업별 곡선·비교·판매 품목) + 오늘 주문(펼칠 때만 조회) */}
          <section className="min-w-0 bg-canvas rounded-xl p-3 md:p-4 shadow-level-1 border border-hairline">
            <TodaySummary summary={summary} isLoading={isLoading} onRefresh={refresh} />
            <TodaySection initialPopups={todayPopups} />
            <TodayOrdersSection
              open={ordersOpen}
              onToggle={() => setOrdersOpen(v => !v)}
              orders={todayOrders}
              todayRevenue={todayRevenue}
              isLoading={isOrdersLoading}
              onDeleteOrder={handleDeleteOrder}
            />
          </section>

          <CalendarSection
            calendarSales={calendarSales}
            popupEvents={popupEvents}
            calendarMonth={calendarMonth}
            isLoading={isCalendarLoading}
            todayStr={todayStr}
            onMonthChange={changeMonth}
            saveDay={saveDay}
            removeDay={removeDay}
            onPopupSaved={() => { refreshCalendar(); refreshPopupStats(); }}
          />

          {/* ③ 팝업 분석 — 펼칠 때만 조회(팝업 하나에 7개 조회) */}
          <div className="lg:col-span-2 bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
            {popupOpen ? (
              <>
                <button type="button" onClick={() => setPopupOpen(false)} className="float-right bg-transparent border-none text-[11px] font-semibold text-ink-faint cursor-pointer hover:text-ink-muted">접기 ▴</button>
                <PopupStatsSection
                  popupEvents={popupEvents}
                  selectedPopupId={selectedPopupId}
                  popupMenuBreakdown={popupMenuBreakdown}
                  popupDailySales={popupDailySales}
                  popupRawOrders={popupRawOrders}
                  manualHourlyEntries={manualHourlyEntries}
                  manualDailyHourly={manualDailyHourly}
                  isLoading={isPopupStatsLoading}
                  onSelectPopup={setSelectedPopupId}
                  onRefresh={refreshPopupStats}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPopupOpen(true)}
                className="w-full flex items-center justify-between bg-transparent border-none p-0 cursor-pointer text-left"
              >
                <span>
                  <span className="block text-lg font-bold text-ink">팝업별 매출 분석</span>
                  <span className="block text-[12px] text-ink-faint">팝업을 골라 일별 추이·요일·시간대·메뉴 비중, 정산표 붙여넣기, PDF 보고서</span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-primary-700">펼치기 ▾</span>
              </button>
            )}
          </div>

          {/* 전체 기간 집계라 맨 아래 — 화면에 닿을 때만 조회한다 */}
          <div className="lg:col-span-2">
            <LifetimeTotalCard />
          </div>
        </div>
      </main>

    </>
  );
}
