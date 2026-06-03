'use client';

import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPrice } from '@/lib/utils';
import { fetchOrdersByPeriod } from '@/app/actions/orders';
import { HOURS, buildHourlyData } from '../_lib/hourly';
import { getPeriodBounds } from '../_lib/period';
import type { HourlyData } from '../_lib/hourly';
import type { OrderRecordWithItems } from '@/types/api';
import type { PopupEvent } from '@/types/database';

type HourlyPeriod = 'today' | 'week' | 'month' | 'popup';

const PERIODS: Array<{ key: HourlyPeriod; label: string }> = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'popup', label: '팝업별' },
];

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

interface Props {
  todayOrders: OrderRecordWithItems[];
  isLoadingToday: boolean;
  popupEvents: PopupEvent[];
}

export default function HourlySalesSection({ todayOrders, isLoadingToday, popupEvents }: Props) {
  const [period, setPeriod] = useState<HourlyPeriod>('today');
  const [selectedPopupId, setSelectedPopupId] = useState<number | null>(null);
  const [periodOrders, setPeriodOrders] = useState<Array<{ created_at: string; total_price: number }>>([]);
  const [isPeriodLoading, setIsPeriodLoading] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    const doFetch = async () => {
      if (period === 'today') return;
      if (period === 'popup') {
        if (!selectedPopupId) return;
        const popup = popupEvents.find((p) => p.id === selectedPopupId);
        if (!popup) return;
        setIsPeriodLoading(true);
        const res = await fetchOrdersByPeriod(`${popup.start_date}T00:00:00+09:00`, `${popup.end_date}T23:59:59+09:00`);
        if (!isCurrent) return;
        setPeriodOrders(res.success && res.data ? res.data : []);
        setIsPeriodLoading(false);
        return;
      }
      setIsPeriodLoading(true);
      const { startISO, endISO } = getPeriodBounds(period);
      const res = await fetchOrdersByPeriod(startISO, endISO);
      if (!isCurrent) return;
      setPeriodOrders(res.success && res.data ? res.data : []);
      setIsPeriodLoading(false);
    };

    doFetch();
    return () => { isCurrent = false; };
  }, [period, selectedPopupId, popupEvents]);

  const isLoading = period === 'today' ? isLoadingToday : isPeriodLoading;

  const hourlyData = useMemo((): HourlyData[] => {
    if (period === 'today') return buildHourlyData(todayOrders);
    return buildHourlyData(periodOrders);
  }, [period, todayOrders, periodOrders]);

  const hasData = period === 'today'
    ? todayOrders.length > 0
    : period === 'popup' && !selectedPopupId
      ? false
      : periodOrders.length > 0;

  const peakHour = useMemo(
    () => {
      const peak = hourlyData.reduce((max, d) => (d.revenue > max.revenue ? d : max), hourlyData[0]);
      return peak?.revenue > 0 ? peak : null;
    },
    [hourlyData]
  );

  const selectedPopup = popupEvents.find((p) => p.id === selectedPopupId);

  const subtitle =
    period === 'today' ? '오늘 · 09시 ~ 21시' :
    period === 'week' ? '이번 주 · 시간대별 합계' :
    period === 'month' ? '이번 달 · 시간대별 합계' :
    selectedPopup ? `${selectedPopup.name} · ${selectedPopup.start_date} ~ ${selectedPopup.end_date}` : '팝업 선택';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="m-0 text-lg font-bold">시간대별 판매 현황</h3>
          <p className="m-0 text-xs text-[#aaa] mt-0.5">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            className={`px-3.5 py-1.5 rounded-full border cursor-pointer text-[13px] font-semibold transition-all duration-200 ${period === key ? 'bg-primary-700 text-white border-primary-700' : 'bg-[#f5f6f7] border-[#ddd] text-[#555] hover:bg-[#eee] hover:border-[#ccc]'}`}
            onClick={() => { setPeriod(key); if (key !== 'popup') setPeriodOrders([]); }}
          >
            {label}
          </button>
        ))}
      </div>

      {period === 'popup' && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {popupEvents.length === 0 ? (
            <p className="text-xs text-[#aaa]">등록된 팝업이 없습니다.</p>
          ) : (
            popupEvents.map((p) => (
              <button
                key={p.id}
                className={`px-3 py-1 rounded-lg border cursor-pointer text-[12px] font-medium transition-all duration-200 ${selectedPopupId === p.id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-[#f5f6f7] border-[#ddd] text-[#666] hover:bg-[#eee]'}`}
                onClick={() => setSelectedPopupId(p.id)}
              >
                {p.name}
              </button>
            ))
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[#999]">불러오는 중...</p>
      ) : period === 'popup' && !selectedPopupId ? (
        <div className="rounded-xl border border-dashed border-[#ddd] p-4 text-center text-sm text-[#bbb]">
          팝업을 선택하면 해당 기간의 시간대별 매출을 확인할 수 있습니다.
        </div>
      ) : !hasData ? (
        <p className="text-sm text-[#999]">해당 기간 판매 내역이 없습니다.</p>
      ) : (
        <>
          {peakHour && (
            <p className="text-xs text-[#888] mb-3">
              피크 시간대{' '}
              <span className="font-bold text-primary-700">{peakHour.label}</span>
              {` · ₩${formatPrice(peakHour.revenue)} · ${peakHour.orderCount}건`}
            </p>
          )}
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v: number) => {
                    if (v === 0) return '0';
                    if (v >= 10000) return `${Math.round(v / 10000)}만`;
                    if (v >= 1000) return `${Math.round(v / 1000)}k`;
                    return String(v);
                  }}
                  tick={{ fontSize: 11, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <Tooltip content={<HourlyTooltip />} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 2' }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
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

export { HOURS };
