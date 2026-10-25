import { describe, it, expect } from 'vitest';
import { buildHourlyData, buildHourlyDataWithDaily } from '@/app/(admin)/stats/_lib/hourly';

describe('buildHourlyDataWithDaily', () => {
  // created_at은 naive UTC — KST 10/25 11:10 = UTC 02:10
  const orders = [
    { created_at: '2026-10-25T02:10:00', total_price: 9000 },
    { created_at: '2026-10-24T05:30:00', total_price: 8000 },
  ];

  it('하루 시간대 수기 입력이 있는 날은 그날 POS 대신 쓰고, 다른 날 POS는 그대로 더한다', () => {
    const rows = buildHourlyDataWithDaily(orders, [
      { date: '2026-10-25', hour: 11, totalRevenue: 120000, totalOrders: null },
      { date: '2026-10-25', hour: 20, totalRevenue: 87500, totalOrders: 5 },
    ]);
    const at = (h: number) => rows.find((r) => r.hour === h);
    expect(at(11)).toMatchObject({ revenue: 120000, orderCount: 0 });
    expect(at(14)).toMatchObject({ revenue: 8000, orderCount: 1 });
    expect(at(20)).toMatchObject({ revenue: 87500, orderCount: 5 });
  });

  it('수기 입력이 없으면 기존 POS 집계와 같다', () => {
    expect(buildHourlyDataWithDaily(orders, [])).toEqual(buildHourlyData(orders));
  });
});
