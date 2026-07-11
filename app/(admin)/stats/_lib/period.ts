export type Period = 'today' | 'week' | 'month';

export const PERIOD_LABELS: Record<Period, string> = {
  today: '오늘',
  week: '이번 주',
  month: '이번 달',
};

export function getPeriodBounds(period: Period): { startISO: string; endISO: string; label: string } {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);

  // created_at은 timestamp without time zone(naive UTC) 컬럼 — +09:00 오프셋 문자열을 그대로 보내면
  // PostgREST가 오프셋을 버리고 캐스팅해 9시간이 어긋난다. UTC로 직접 환산해 보낸다.
  const toUTC = (kstDateStr: string, time: string) => new Date(`${kstDateStr}T${time}+09:00`).toISOString();

  if (period === 'today') {
    return { startISO: toUTC(todayStr, '00:00:00'), endISO: toUTC(todayStr, '23:59:59.999'), label: '오늘' };
  }
  if (period === 'week') {
    const dayOfWeek = kstNow.getUTCDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayStr = new Date(kstNow.getTime() - daysFromMonday * 86400 * 1000).toISOString().slice(0, 10);
    return { startISO: toUTC(mondayStr, '00:00:00'), endISO: toUTC(todayStr, '23:59:59.999'), label: '이번 주' };
  }
  const monthStr = kstNow.toISOString().slice(0, 7);
  return { startISO: toUTC(`${monthStr}-01`, '00:00:00'), endISO: toUTC(todayStr, '23:59:59.999'), label: '이번 달' };
}
