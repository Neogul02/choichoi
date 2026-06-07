import type { DailySalesItem } from '@/types/api';

export interface DayOfWeekData {
  dayIndex: number;
  label: string;
  revenue: number;
  orderCount: number;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function buildDayOfWeekData(dailySales: DailySalesItem[]): DayOfWeekData[] {
  const map: Record<number, { revenue: number; orderCount: number }> = {};
  DAYS.forEach((_, i) => { map[i] = { revenue: 0, orderCount: 0 }; });

  for (const item of dailySales) {
    const dayIndex = new Date(`${item.date}T12:00:00+09:00`).getDay();
    map[dayIndex].revenue += item.revenue;
    map[dayIndex].orderCount += item.orderCount;
  }

  return DAYS.map((label, i) => ({ dayIndex: i, label, ...map[i] }));
}
