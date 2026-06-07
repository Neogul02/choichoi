import { HOURS } from './hourly';

export const DAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
export type DayLabel = (typeof DAYS)[number];

export const DAY_COLORS: Record<DayLabel, string> = {
  '일': '#f43f5e',
  '월': '#6366f1',
  '화': '#f59e0b',
  '수': '#14b8a6',
  '목': '#8b5cf6',
  '금': '#f97316',
  '토': '#0ea5e9',
};

export type DayHourMatrix = Record<DayLabel, Record<number, { revenue: number; orderCount: number }>>;

export function buildDayHourMatrix(
  orders: Array<{ created_at: string; total_price: number }>
): { matrix: DayHourMatrix; activeDays: DayLabel[] } {
  const matrix = {} as DayHourMatrix;
  DAYS.forEach((day) => {
    matrix[day] = {};
    HOURS.forEach((h) => { matrix[day][h] = { revenue: 0, orderCount: 0 }; });
  });

  for (const order of orders) {
    const s = order.created_at.replace(' ', 'T');
    const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
    const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
    const kst = new Date(utcMs + 9 * 3600 * 1000);
    const dayLabel = DAYS[kst.getUTCDay()];
    const kstHour = kst.getUTCHours();
    if (matrix[dayLabel]?.[kstHour] !== undefined) {
      matrix[dayLabel][kstHour].revenue += Number(order.total_price ?? 0);
      matrix[dayLabel][kstHour].orderCount += 1;
    }
  }

  const activeDays = [...DAYS].filter((day) =>
    HOURS.some((h) => matrix[day][h].orderCount > 0)
  ) as DayLabel[];

  return { matrix, activeDays };
}
