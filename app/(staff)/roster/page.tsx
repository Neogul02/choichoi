import RosterOverviewClient from './_components/RosterOverviewClient';
import { fetchRosterOverview } from '@/app/actions/roster-view';
import { getWeekStart } from '@/lib/staffing';
import { addDays, kstToday } from '@/lib/date';

// 인사 페이지와 동일하게 서버에서 초기 주간 데이터를 프리페치해 클라이언트 왕복을 줄인다
export default async function RosterOverviewPage() {
  const today = kstToday();
  const weekStart = getWeekStart(today);
  const res = await fetchRosterOverview(weekStart, addDays(weekStart, 6));
  return (
    <RosterOverviewClient
      today={today}
      initialWeekStart={weekStart}
      initialOverview={res.success && res.data ? res.data : null}
    />
  );
}
