export type Period = 'today' | 'week' | 'month';

export const PERIOD_LABELS: Record<Period, string> = {
  today: '오늘',
  week: '이번 주',
  month: '이번 달',
};

export function getKSTDateStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function getPeriodBounds(period: Period): { startISO: string; endISO: string; label: string } {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);

  if (period === 'today') {
    return { startISO: `${todayStr}T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '오늘' };
  }
  if (period === 'week') {
    const dayOfWeek = kstNow.getUTCDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayStr = new Date(kstNow.getTime() - daysFromMonday * 86400 * 1000).toISOString().slice(0, 10);
    return { startISO: `${mondayStr}T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '이번 주' };
  }
  const monthStr = kstNow.toISOString().slice(0, 7);
  return { startISO: `${monthStr}-01T00:00:00+09:00`, endISO: `${todayStr}T23:59:59+09:00`, label: '이번 달' };
}
