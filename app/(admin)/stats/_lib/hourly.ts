import { utcToKst } from '@/lib/date';

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
    const kstHour = utcToKst(order.created_at).getUTCHours();
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

/**
 * 시간대별 수기 입력을 POS 집계 위에 덮어씌운다. 수기 입력이 존재하는 시간(예: 07시)이
 * 기본 영업시간 범위(HOURS, 9~21시) 밖이면 그 시간까지 포함하도록 범위를 넓혀서 반환한다.
 */
export function mergeManualHourlyData(
  computed: HourlyData[],
  manualEntries: Array<{ hour: number; totalRevenue: number; totalOrders: number }>
): HourlyData[] {
  if (manualEntries.length === 0) return computed;

  const manualByHour = new Map(manualEntries.map((e) => [e.hour, e]));
  const allHours = new Set<number>([...computed.map((d) => d.hour), ...manualByHour.keys()]);
  const minHour = Math.min(...allHours);
  const maxHour = Math.max(...allHours);
  const computedByHour = new Map(computed.map((d) => [d.hour, d]));

  const rows: HourlyData[] = [];
  for (let h = minHour; h <= maxHour; h++) {
    const manual = manualByHour.get(h);
    const base = computedByHour.get(h);
    rows.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}시`,
      revenue: manual ? manual.totalRevenue : (base?.revenue ?? 0),
      orderCount: manual ? manual.totalOrders : (base?.orderCount ?? 0),
    });
  }
  return rows;
}
