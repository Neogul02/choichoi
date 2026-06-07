'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
  LineChart, Line, Legend,
} from 'recharts';
import { formatRevenueTick, formatDateLabel, formatPrice } from '@/lib/utils';
import { buildDayHourMatrix, DAY_COLORS, DAYS } from '@/app/(admin)/stats/_lib/dayofweek';
import { HOURS } from '@/app/(admin)/stats/_lib/hourly';
import type { DayLabel } from '@/app/(admin)/stats/_lib/dayofweek';
import type { MenuSalesItem, DailySalesItem } from '@/types/api';
import type { PopupEvent } from '@/types/database';

type Metric = 'revenue' | 'orderCount';

interface DailyTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: DailySalesItem & { dateLabel: string } }>;
  label?: string;
}

function DailyTooltip({ active, payload, label }: DailyTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#e0e0e0] rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-bold mb-1 text-[#333]">{label}</p>
      <p className="text-primary-700">₩{payload[0].value.toLocaleString('ko-KR')}</p>
      <p className="text-[#666]">주문 {payload[0].payload.orderCount}건</p>
    </div>
  );
}


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
  popupEvents: PopupEvent[];
  selectedPopupId: number | null;
  popupMenuBreakdown: MenuSalesItem[];
  popupDailySales: DailySalesItem[];
  popupRawOrders: Array<{ created_at: string; total_price: number }>;
  isLoading: boolean;
  onSelectPopup: (id: number | null) => void;
}

export default function PopupStatsSection({
  popupEvents, selectedPopupId, popupMenuBreakdown, popupDailySales, popupRawOrders, isLoading, onSelectPopup,
}: Props) {
  const selectedPopup = popupEvents.find((p) => p.id === selectedPopupId) ?? null;
  const [metric, setMetric] = useState<Metric>('revenue');

  const popupTotalRevenue = useMemo(() => popupDailySales.reduce((s, d) => s + d.revenue, 0), [popupDailySales]);
  const popupTotalOrders = useMemo(() => popupDailySales.reduce((s, d) => s + d.orderCount, 0), [popupDailySales]);
  const popupDaysCount = useMemo(() => {
    if (!selectedPopup) return 0;
    const start = new Date(selectedPopup.start_date);
    const end = new Date(selectedPopup.end_date);
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [selectedPopup]);

  const popupMenuChartHeight = useMemo(() => Math.max(180, popupMenuBreakdown.length * 38), [popupMenuBreakdown.length]);
  const dailyChartData = useMemo(
    () => popupDailySales.map((d) => ({ ...d, dateLabel: formatDateLabel(d.date) })),
    [popupDailySales]
  );

  const { matrix, activeDays } = useMemo(() => buildDayHourMatrix(popupRawOrders), [popupRawOrders]);

  const dayHourRows = useMemo(
    () =>
      HOURS.map((h) => {
        const row: Record<string, number | string> = { label: `${String(h).padStart(2, '0')}시` };
        activeDays.forEach((day) => { row[day] = matrix[day][h][metric]; });
        return row;
      }),
    [matrix, activeDays, metric]
  );

  return (
    <div className="bg-[#f4f7f5] rounded-xl p-4">
      <h3 className="m-0 mb-3 text-lg font-bold">팝업별 매출 분석</h3>
      {popupEvents.length === 0 ? (
        <p className="m-0 text-[#999] text-sm">등록된 팝업이 없습니다. 일정 탭에서 팝업을 먼저 생성하세요.</p>
      ) : (
        <>
          <select
            value={selectedPopupId ?? ''}
            onChange={(e) => onSelectPopup(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-[#d8e8e0] rounded-lg px-3 py-2.5 text-sm font-semibold bg-white text-[#333] outline-none focus:border-primary-700 mb-4"
          >
            <option value="">팝업을 선택하세요</option>
            {popupEvents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.start_date} ~ {p.end_date})
              </option>
            ))}
          </select>

          {selectedPopup && (
            isLoading ? (
              <p className="text-[#999] text-sm text-center py-6">데이터를 불러오는 중...</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white rounded-xl p-3 border border-[#e4e4e4] text-center">
                    <div className="text-[11px] text-[#888] font-medium mb-0.5">총 매출</div>
                    <div className="text-[13px] font-extrabold text-primary-700">₩{formatPrice(popupTotalRevenue)}</div>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-[#e4e4e4] text-center">
                    <div className="text-[11px] text-[#888] font-medium mb-0.5">총 주문</div>
                    <div className="text-[13px] font-extrabold text-[#333]">{popupTotalOrders}건</div>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-[#e4e4e4] text-center">
                    <div className="text-[11px] text-[#888] font-medium mb-0.5">운영 일수</div>
                    <div className="text-[13px] font-extrabold text-[#333]">{popupDaysCount}일</div>
                  </div>
                </div>

                {popupDailySales.length > 0 ? (
                  <div className="bg-white rounded-xl p-3 border border-[#e4e4e4] mb-3">
                    <h4 className="m-0 mb-3 text-sm font-bold text-[#333]">일별 매출 추이</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dailyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={40} />
                        <Tooltip content={<DailyTooltip />} />
                        <Bar dataKey="revenue" fill="#3d9966" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="revenue" position="top" formatter={(v: number) => formatRevenueTick(v)} style={{ fontSize: 10, fill: '#555' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-[#999] text-sm mb-3">해당 팝업 기간에 매출 데이터가 없습니다.</p>
                )}

                {activeDays.length > 0 && (
                  <div className="bg-white rounded-xl p-3 border border-[#e4e4e4] mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="m-0 text-sm font-bold text-[#333]">요일 × 시간대별 판매 현황</h4>
                      <div className="flex gap-1">
                        {(['revenue', 'orderCount'] as Metric[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setMetric(m)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-all ${metric === m ? 'bg-primary-700 text-white border-primary-700' : 'bg-[#f5f6f7] text-[#666] border-[#ddd] hover:bg-[#eee]'}`}
                          >
                            {m === 'revenue' ? '매출' : '주문수'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={dayHourRows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                        <YAxis
                          tickFormatter={metric === 'revenue' ? formatRevenueTick : String}
                          tick={{ fontSize: 11, fill: '#888' }}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                          allowDecimals={false}
                        />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const filtered = payload.filter((p) => Number(p.value) > 0);
                          if (!filtered.length) return null;
                          return (
                            <div className="bg-white border border-[#e0e0e0] rounded-lg p-2.5 text-xs shadow-md min-w-[110px]">
                              <p className="font-bold mb-1.5 text-[#333]">{label}</p>
                              {filtered.map((p) => (
                                <p key={String(p.dataKey)} style={{ color: p.stroke as string }} className="mb-0.5">
                                  {String(p.dataKey)}요일:{' '}
                                  {metric === 'revenue'
                                    ? `₩${Number(p.value).toLocaleString('ko-KR')}`
                                    : `${p.value}건`}
                                </p>
                              ))}
                            </div>
                          );
                        }} />
                        <Legend
                          formatter={(value: string) => <span style={{ fontSize: 11, color: '#555' }}>{value}요일</span>}
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ paddingTop: 8 }}
                        />
                        {(activeDays as DayLabel[]).map((day) => (
                          <Line
                            key={day}
                            type="monotone"
                            dataKey={day}
                            stroke={DAY_COLORS[day]}
                            strokeWidth={2}
                            dot={{ r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-[#bbb] mt-1">
                      {DAYS.filter((d) => !activeDays.includes(d as DayLabel)).length > 0
                        ? `※ 판매 없는 요일(${DAYS.filter((d) => !activeDays.includes(d as DayLabel)).join('·')})은 표시 생략`
                        : null}
                    </p>
                  </div>
                )}

                {popupMenuBreakdown.length > 0 ? (
                  <div className="bg-white rounded-xl p-3 border border-[#e4e4e4]">
                    <h4 className="m-0 mb-3 text-sm font-bold text-[#333]">메뉴별 판매</h4>
                    <div style={{ height: popupMenuChartHeight }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={popupMenuBreakdown} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                          <XAxis type="number" tickFormatter={String} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: '#444' }} axisLine={false} tickLine={false} />
                          <Tooltip content={<MenuTooltip />} />
                          <Bar dataKey="totalQuantity" radius={[0, 4, 4, 0]}>
                            {popupMenuBreakdown.map((item) => (
                              <Cell key={item.id} fill={item.color} />
                            ))}
                            <LabelList dataKey="totalQuantity" position="right" formatter={(v: number) => `${v}개`} style={{ fontSize: 11, fill: '#555' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <p className="text-[#999] text-sm">메뉴 판매 내역이 없습니다.</p>
                )}
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
