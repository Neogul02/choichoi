import StatsPageClient from './_components/StatsPageClient';
import { fetchMonthlySalesCalendar, fetchManualSalesForMonth, fetchTodaysSalesForStats, fetchTodaysSalesByPopupForStats } from '@/app/actions/stats';
import { fetchPopupEvents } from '@/app/actions/schedule';
import { kstNow } from '@/lib/date';
import type { CalendarSalesData, ManualSalesEntry } from '@/types/api';

// 매출 데이터는 요청 시점 기준이어야 하므로 빌드 타임 프리렌더 금지
export const dynamic = 'force-dynamic';

// 서버 컴포넌트에서 서버 액션 함수를 직접 호출하면 HTTP 왕복 없이 in-process로 병렬 실행된다.
// 클라이언트 마운트 후 호출하던 기존 방식은 Next.js가 액션 POST를 직렬화하는 데다
// 요청마다 proxy.ts의 인증 검사가 붙어 초기 로딩이 느렸다. (hr/page.tsx와 동일 패턴)
// 첫 화면에 보이는 것(오늘 요약·오늘 팝업별·이번 달 달력·팝업 목록)만 받는다. 오늘 주문 전체·메뉴 집계·누적 합계는
// 각 섹션이 클라이언트에서 따로 받는다(누적은 화면에 닿을 때) — 예전엔 8개를 모두 기다렸다.
async function getStatsBootstrap() {
  const now = kstNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;

  return Promise.all([
    fetchTodaysSalesForStats(),
    fetchMonthlySalesCalendar(y, m),
    fetchManualSalesForMonth(y, m),
    fetchPopupEvents(),
    fetchTodaysSalesByPopupForStats(),
  ]);
}

export default async function StatsPage() {
  const [summaryRes, calRes, manualRes, popupsRes, todayPopupsRes] = await getStatsBootstrap();

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
      initialOrders={null}
      initialBreakdown={null}
      initialCalendar={initialCalendar}
      initialPopupEvents={popupsRes.success ? popupsRes.data ?? null : null}
      todayPopups={todayPopupsRes.success ? todayPopupsRes.data ?? null : null}
    />
  );
}
