import type { CalendarSalesData } from '@/types/api';
import type { PopupEvent } from '@/types/database';

const dateKey = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 이 달에 걸치는 팝업 — 시작일 순(달력 위에서 아래로 읽는 순서와 같게) */
export function monthPopupsOf(popupEvents: PopupEvent[], month: Date): PopupEvent[] {
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const first = dateKey(month.getFullYear(), month.getMonth(), 1);
  const last = dateKey(month.getFullYear(), month.getMonth(), days);
  return popupEvents
    .filter(p => p.start_date <= last && p.end_date >= first)
    .sort((a, b) => (a.start_date === b.start_date ? a.id - b.id : a.start_date < b.start_date ? -1 : 1));
}

/**
 * 팝업별 월 합계 — 날짜별 팝업 집계(popupByDate)에서만 더한다(null = 팝업 미지정).
 * 일정 기간으로 일 매출을 쪼개 나누면 두 팝업이 같이 도는 날 매출이 양쪽에 중복 계상된다.
 */
export function popupTotalsOf(calendarSales: CalendarSalesData): Map<number | null, { revenue: number; orders: number }> {
  const acc = new Map<number | null, { revenue: number; orders: number }>();
  for (const list of Object.values(calendarSales.popupByDate ?? {})) {
    for (const row of list) {
      const cur = acc.get(row.popupId) ?? { revenue: 0, orders: 0 };
      cur.revenue += row.revenue;
      cur.orders += row.orders;
      acc.set(row.popupId, cur);
    }
  }
  return acc;
}
