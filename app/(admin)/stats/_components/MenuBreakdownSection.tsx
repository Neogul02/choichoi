'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { formatRevenueTick, formatPrice } from '@/lib/utils';
import type { MenuSalesItem } from '@/types/api';

type Period = 'today' | 'week' | 'month';
type BreakdownView = 'list' | 'chart';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
];

interface MenuTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: MenuSalesItem }>;
}

function MenuTooltip({ active, payload }: MenuTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#e0e0e0] rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-bold mb-1 text-[#333]">{payload[0].payload.name}</p>
      <p className="text-[#555]">판매량: {payload[0].value}개</p>
      <p className="text-primary-700">매출: ₩{payload[0].payload.totalRevenue.toLocaleString('ko-KR')}</p>
    </div>
  );
}

interface Props {
  breakdown: MenuSalesItem[];
  period: Period;
  isLoading: boolean;
  periodLabel: string;
  onPeriodChange: (p: Period) => void;
}

export default function MenuBreakdownSection({ breakdown, period, isLoading, periodLabel, onPeriodChange }: Props) {
  const [breakdownView, setBreakdownView] = useState<BreakdownView>('list');
  const maxQuantity = useMemo(() => (breakdown.length > 0 ? breakdown[0].totalQuantity : 1), [breakdown]);
  const chartHeight = useMemo(() => Math.max(180, breakdown.length * 38), [breakdown.length]);

  return (
    <div className="mb-4 md:mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-lg font-bold">메뉴별 판매 현황 ({periodLabel})</h3>
        {breakdown.length > 0 && (
          <div className="flex gap-1">
            <button
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all ${breakdownView === 'list' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-[#ddd] text-[#555] hover:bg-[#f5f5f5]'}`}
              onClick={() => setBreakdownView('list')}
            >
              리스트
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-all ${breakdownView === 'chart' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-[#ddd] text-[#555] hover:bg-[#f5f5f5]'}`}
              onClick={() => setBreakdownView('chart')}
            >
              차트
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            className={`px-3.5 py-1.5 rounded-full border bg-[#f5f6f7] cursor-pointer text-[13px] font-semibold transition-all duration-200 ${period === key ? 'bg-primary-700 text-white border-primary-700' : 'border-[#ddd] text-[#555] hover:bg-[#eee] hover:border-[#ccc]'}`}
            onClick={() => onPeriodChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p>불러오는 중...</p>
      ) : breakdown.length === 0 ? (
        <p className="m-0 text-[#999] text-sm">해당 기간 판매 내역이 없습니다.</p>
      ) : breakdownView === 'chart' ? (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={breakdown} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: '#444' }} axisLine={false} tickLine={false} />
              <Tooltip content={<MenuTooltip />} />
              <Bar dataKey="totalQuantity" radius={[0, 4, 4, 0]}>
                {breakdown.map((item) => (
                  <Cell key={item.id} fill={item.color} />
                ))}
                <LabelList dataKey="totalQuantity" position="right" formatter={(v: number) => `${v}개`} style={{ fontSize: 11, fill: '#555' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none">
          {breakdown.map((item) => (
            <li key={item.id} className="bg-white rounded-lg p-2.5 md:p-3 border border-[#eee]">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full shrink-0 border-2 border-black/10 inline-block" style={{ backgroundColor: item.color }} />
                <span className="text-sm font-semibold">{item.name}</span>
              </div>
              <div className="flex flex-wrap md:flex-nowrap items-center gap-2.5">
                <div className="w-full md:flex-1 h-2 bg-[#eee] rounded-full overflow-hidden order-last md:order-none">
                  <div className="h-full rounded-full transition-[width] duration-400 ease-out min-w-[4px]" style={{ width: `${(item.totalQuantity / maxQuantity) * 100}%`, backgroundColor: item.color }} />
                </div>
                <span className="text-[13px] font-bold min-w-[36px] text-right text-[#333] shrink-0">{item.totalQuantity}개</span>
                <span className="text-[13px] font-bold text-primary-700 min-w-[90px] text-right shrink-0">₩{formatPrice(item.totalRevenue)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
