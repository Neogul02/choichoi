'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { formatPrice } from '@/lib/utils';
import { PERIOD_LABELS } from '../_lib/period';
import type { Period } from '../_lib/period';
import type { MenuSalesItem } from '@/types/api';

const PERIOD_KEYS: Period[] = ['today', 'week', 'month'];

interface MenuTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: MenuSalesItem }>;
}

function MenuTooltip({ active, payload }: MenuTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-white border border-[#e0e0e0] rounded-lg p-2.5 text-xs shadow-md">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
        <p className="font-bold text-[#333]">{item.name}</p>
      </div>
      <p className="text-[#555]">판매량: {item.totalQuantity}개</p>
      <p className="text-primary-700">매출: ₩{formatPrice(item.totalRevenue)}</p>
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
  const chartData = useMemo(
    () => breakdown.map((item) => ({
      ...item,
      shortName: item.name.length > 5 ? item.name.slice(0, 5) + '…' : item.name,
    })),
    [breakdown]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-lg font-bold">메뉴별 판매 현황 ({periodLabel})</h3>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {PERIOD_KEYS.map((key) => (
          <button
            key={key}
            className={`px-3.5 py-1.5 rounded-full border cursor-pointer text-[13px] font-semibold transition-all duration-200 ${period === key ? 'bg-primary-700 text-white border-primary-700' : 'bg-[#f5f6f7] border-[#ddd] text-[#555] hover:bg-[#eee] hover:border-[#ccc]'}`}
            onClick={() => onPeriodChange(key)}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-[#999]">불러오는 중...</p>
      ) : breakdown.length === 0 ? (
        <p className="m-0 text-[#999] text-sm">해당 기간 판매 내역이 없습니다.</p>
      ) : (
        <div style={{ height: Math.max(200, breakdown.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 8, left: -4, bottom: 4 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis
                dataKey="shortName"
                tick={{ fontSize: 11, fill: '#666' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={32}
                allowDecimals={false}
              />
              <Tooltip content={<MenuTooltip />} cursor={{ fill: '#f5f5f5' }} />
              <Bar dataKey="totalQuantity" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chartData.map((item) => (
                  <Cell key={item.id} fill={item.color} fillOpacity={0.9} />
                ))}
                <LabelList
                  dataKey="totalQuantity"
                  position="top"
                  formatter={(v: number) => `${v}개`}
                  style={{ fontSize: 11, fill: '#555', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
