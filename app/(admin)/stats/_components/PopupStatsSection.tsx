'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { formatRevenueTick, formatDateLabel, formatPrice } from '@/lib/utils';
import type { MenuSalesItem, DailySalesItem } from '@/types/api';
import type { PopupEvent } from '@/types/database';

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
  isLoading: boolean;
  onSelectPopup: (id: number | null) => void;
}

export default function PopupStatsSection({ popupEvents, selectedPopupId, popupMenuBreakdown, popupDailySales, isLoading, onSelectPopup }: Props) {
  const selectedPopup = popupEvents.find((p) => p.id === selectedPopupId) ?? null;

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
