import StatsPageClient from './_components/StatsPageClient';
import { fetchTodaysSales, fetchTodaysOrdersWithItems } from '@/app/actions/orders';
import { fetchMenuSalesBreakdown, fetchMonthlySalesCalendar, fetchManualSalesForMonth } from '@/app/actions/stats';
import { fetchPopupEvents } from '@/app/actions/schedule';
import { getPeriodBounds } from './_lib/period';
import type { CalendarSalesData, ManualSalesEntry } from '@/types/api';

// 매출 데이터는 요청 시점 기준이어야 하므로 빌드 타임 프리렌더 금지
export const dynamic = 'force-dynamic';

// 서버 컴포넌트에서 서버 액션 함수를 직접 호출하면 HTTP 왕복 없이 in-process로 병렬 실행된다.
// 클라이언트 마운트 후 호출하던 기존 방식은 Next.js가 액션 POST를 직렬화하는 데다
// 요청마다 proxy.ts의 인증 검사가 붙어 초기 로딩이 느렸다. (hr/page.tsx와 동일 패턴)
async function getStatsBootstrap() {
  const { startISO, endISO } = getPeriodBounds('today');
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth() + 1;

  return Promise.all([
    fetchTodaysSales(),
    fetchTodaysOrdersWithItems(),
    fetchMenuSalesBreakdown(startISO, endISO),
    fetchMonthlySalesCalendar(y, m),
    fetchManualSalesForMonth(y, m),
    fetchPopupEvents(),
  ]);
}

export default async function StatsPage() {
  const [summaryRes, ordersRes, breakdownRes, calRes, manualRes, popupsRes] = await getStatsBootstrap();

  // 수동 입력 매출을 달력 데이터에 병합 — useCalendar.load()와 동일한 형태로 맞춘다
  const manualByDate: Record<string, ManualSalesEntry> = {};
  if (manualRes.success && manualRes.data) {
    for (const entry of manualRes.data) manualByDate[entry.sale_date] = entry;
  }
  const initialCalendar: CalendarSalesData | null =
    calRes.success && calRes.data ? { ...calRes.data, manualByDate } : null;

  // 실패한 항목은 null로 내려 클라이언트 훅이 기존 경로로 재조회하게 한다
  return (
    <StatsPageClient
      initialSummary={summaryRes.success ? summaryRes.data ?? null : null}
      initialOrders={ordersRes.success ? ordersRes.data ?? null : null}
      initialBreakdown={breakdownRes.success ? breakdownRes.data ?? null : null}
      initialCalendar={initialCalendar}
      initialPopupEvents={popupsRes.success ? popupsRes.data ?? null : null}
    />
  );
}
