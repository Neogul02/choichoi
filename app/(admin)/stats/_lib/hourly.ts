export const HOURS = Array.from({ length: 13 }, (_, i) => i + 9);

export interface HourlyData {
  hour: number;
  label: string;
  revenue: number;
  orderCount: number;
}

export function buildHourlyData(
  orders: Array<{ created_at: string; total_price: number }>
): HourlyData[] {
  const map: Record<number, { revenue: number; orderCount: number }> = {};
  HOURS.forEach((h) => { map[h] = { revenue: 0, orderCount: 0 }; });

  orders.forEach((order) => {
    const s = order.created_at.replace(' ', 'T');
    const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
    const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
    const kstHour = new Date(utcMs + 9 * 3600 * 1000).getUTCHours();
    if (map[kstHour] !== undefined) {
      map[kstHour].revenue += Number(order.total_price ?? 0);
      map[kstHour].orderCount += 1;
    }
  });

  return HOURS.map((h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}시`,
    revenue: map[h].revenue,
    orderCount: map[h].orderCount,
  }));
}
