'use client';

import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPrice } from '@/lib/utils';
import type { OrderRecordWithItems } from '@/types/api';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9); // 9~21

interface HourlyData {
  hour: number;
  label: string;
  revenue: number;
  orderCount: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: HourlyData }>;
}

function HourlyTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#e0e0e0] rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-bold mb-1 text-[#333]">{d.label}</p>
      <p className="text-[#555]">주문: {d.orderCount}건</p>
      <p className="text-primary-700">매출: ₩{formatPrice(d.revenue)}</p>
    </div>
  );
}

type ViewType = 'revenue' | 'orders';

interface Props {
  orders: OrderRecordWithItems[];
  isLoading: boolean;
}

export default function HourlySalesSection({ orders, isLoading }: Props) {
  const [view, setView] = useState<ViewType>('revenue');

  const hourlyData = useMemo((): HourlyData[] => {
    const map: Record<number, { revenue: number; orderCount: number }> = {};
    HOURS.forEach((h) => { map[h] = { revenue: 0, orderCount: 0 }; });

    orders.forEach((order) => {
      const s = order.created_at.replace(' ', 'T');
      const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
      const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
      const kstHour = new Date(utcMs + 9 * 3600 * 1000).getUTCHours();
      if (map[kstHour]) {
        map[kstHour].revenue += Number(order.total_price);
        map[kstHour].orderCount += 1;
      }
    });

    return HOURS.map((h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}시`,
      revenue: map[h].revenue,
      orderCount: map[h].orderCount,
    }));
  }, [orders]);

  const dataKey = view === 'revenue' ? 'revenue' : 'orderCount';

  const peakHour = useMemo(
    () => hourlyData.reduce((max, d) => (d[dataKey] > max[dataKey] ? d : max), hourlyData[0]),
    [hourlyData, dataKey]
  );

  const hasData = orders.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="m-0 text-lg font-bold">시간대별 판매 현황</h3>
          <p className="m-0 text-xs text-[#aaa] mt-0.5">오늘 · 09시 ~ 21시</p>
        </div>
        <div className="flex gap-1">
          <button
            className={`cursor-pointer px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all ${view === 'revenue' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-[#ddd] text-[#555] hover:bg-[#f5f5f5]'}`}
            onClick={() => setView('revenue')}
          >
            매출
          </button>
          <button
            className={`cursor-pointer px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all ${view === 'orders' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-[#ddd] text-[#555] hover:bg-[#f5f5f5]'}`}
            onClick={() => setView('orders')}
          >
            주문수
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-[#999]">불러오는 중...</p>
      ) : !hasData ? (
        <p className="text-sm text-[#999]">오늘 판매 내역이 없습니다.</p>
      ) : (
        <>
          <p className="text-xs text-[#888] mb-3">
            피크 시간대{' '}
            <span className="font-bold text-primary-700">{peakHour.label}</span>
            {view === 'revenue'
              ? ` · ₩${formatPrice(peakHour.revenue)}`
              : ` · ${peakHour.orderCount}건`}
          </p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={
                    view === 'revenue'
                      ? (v: number) => (v === 0 ? '0' : `${Math.round(v / 1000)}k`)
                      : undefined
                  }
                  tick={{ fontSize: 11, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip content={<HourlyTooltip />} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 2' }} />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#hourlyGradient)"
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
