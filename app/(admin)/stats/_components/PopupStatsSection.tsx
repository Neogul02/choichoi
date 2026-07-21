'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
  LineChart, Line, Legend, ComposedChart, Area, PieChart, Pie, ReferenceLine,
} from 'recharts';
import { formatRevenueTick, formatDateLabel, formatPrice } from '@/lib/utils';
import { buildDayHourMatrix, DAY_COLORS, DAYS, WEEKDAY_ORDER, weekendAccentColor, getDayOfWeekLabel } from '@/app/(admin)/stats/_lib/dayofweek';
import { HOURS, buildHourlyData } from '@/app/(admin)/stats/_lib/hourly';
import { kstToday } from '@/lib/date';
import type { DayLabel } from '@/app/(admin)/stats/_lib/dayofweek';
import type { MenuSalesItem, DailySalesItem } from '@/types/api';
import type { PopupEvent } from '@/types/database';

const MenuSalesEditModal = dynamic(() => import('./MenuSalesEditModal'), { ssr: false });

type Metric = 'revenue' | 'orderCount';

interface DailyTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: DailySalesItem & { dateLabel: string } }>;
  label?: string;
}

function DailyTooltip({ active, payload, label }: DailyTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-bold mb-1 text-ink-secondary">{label}</p>
      <p className="text-primary-700">₩{payload[0].value.toLocaleString('ko-KR')}</p>
      <p className="text-ink-muted">주문 {payload[0].payload.orderCount}건</p>
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
    <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-bold mb-1 text-ink-secondary">{payload[0].payload.name}</p>
      <p className="text-ink-muted">판매량: {payload[0].value}개</p>
      <p className="text-primary-700">매출: ₩{payload[0].payload.totalRevenue.toLocaleString('ko-KR')}</p>
    </div>
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4] text-center">
      <div className="text-[11px] text-ink-muted font-medium mb-0.5">{label}</div>
      <div className={`text-[13px] font-extrabold ${accent ? 'text-primary-700' : 'text-ink-secondary'}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-faint mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, right, className = '' }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-canvas rounded-xl p-3 border border-[#e4e4e4] min-w-0 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="m-0 text-sm font-bold text-ink-secondary">{title}</h4>
        {right}
      </div>
      {children}
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
  onRefresh: () => void;
}

export default function PopupStatsSection({
  popupEvents, selectedPopupId, popupMenuBreakdown, popupDailySales, popupRawOrders, isLoading, onSelectPopup, onRefresh,
}: Props) {
  const selectedPopup = popupEvents.find((p) => p.id === selectedPopupId) ?? null;
  const [metric, setMetric] = useState<Metric>('revenue');
  const [showMenuSalesEdit, setShowMenuSalesEdit] = useState(false);

  const popupTotalRevenue = useMemo(() => popupDailySales.reduce((s, d) => s + d.revenue, 0), [popupDailySales]);
  const popupTotalOrders = useMemo(() => popupDailySales.reduce((s, d) => s + d.orderCount, 0), [popupDailySales]);

  // 운영 기간 지표 — 총 일수, 현재까지 경과한 운영 일수, 진행 상태
  const period = useMemo(() => {
    if (!selectedPopup) return null;
    const today = kstToday();
    const dayMs = 86400000;
    const start = new Date(selectedPopup.start_date + 'T00:00:00');
    const end = new Date(selectedPopup.end_date + 'T00:00:00');
    const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
    const status: '예정' | '진행중' | '종료' =
      today < selectedPopup.start_date ? '예정' : today > selectedPopup.end_date ? '종료' : '진행중';
    const elapsedDays =
      status === '예정'
        ? 0
        : Math.min(totalDays, Math.round((new Date(today + 'T00:00:00').getTime() - start.getTime()) / dayMs) + 1);
    return { totalDays, elapsedDays, remainingDays: totalDays - elapsedDays, status };
  }, [selectedPopup]);

  const derived = useMemo(() => {
    const elapsed = period?.elapsedDays ?? 0;
    const salesDays = popupDailySales.filter((d) => d.revenue > 0).length;
    const avgOrderValue = popupTotalOrders > 0 ? Math.round(popupTotalRevenue / popupTotalOrders) : 0;
    const avgDailyRevenue = elapsed > 0 ? Math.round(popupTotalRevenue / elapsed) : 0;
    const avgDailyOrders = elapsed > 0 ? popupTotalOrders / elapsed : 0;
    const daysWithSales = popupDailySales.filter((d) => d.revenue > 0);
    const bestDay = daysWithSales.reduce<DailySalesItem | null>((best, d) => (!best || d.revenue > best.revenue ? d : best), null);
    const worstDay = daysWithSales.reduce<DailySalesItem | null>((worst, d) => (!worst || d.revenue < worst.revenue ? d : worst), null);
    const projectedTotal =
      period?.status === '진행중' && elapsed > 0 ? avgDailyRevenue * period.totalDays : null;
    return { salesDays, avgOrderValue, avgDailyRevenue, avgDailyOrders, bestDay, worstDay, projectedTotal };
  }, [period, popupDailySales, popupTotalRevenue, popupTotalOrders]);

  const dailyChartData = useMemo(
    () => popupDailySales.map((d) => ({ ...d, dateLabel: formatDateLabel(d.date), day: getDayOfWeekLabel(d.date) })),
    [popupDailySales]
  );

  // 누적 매출 + 일별 매출 + 평균 페이스(일평균 × 경과일) — 페이스 대비 위/아래로 변동이 읽히도록
  const cumulativeData = useMemo(() => {
    const total = popupDailySales.reduce((s, d) => s + d.revenue, 0);
    const avg = popupDailySales.length > 0 ? total / popupDailySales.length : 0;
    let sum = 0;
    return popupDailySales.map((d, i) => {
      sum += d.revenue;
      return {
        dateLabel: formatDateLabel(d.date),
        day: getDayOfWeekLabel(d.date),
        cumulative: sum,
        daily: d.revenue,
        pace: Math.round(avg * (i + 1)),
      };
    });
  }, [popupDailySales]);

  const aovTrendData = useMemo(
    () =>
      popupDailySales
        .filter((d) => d.orderCount > 0)
        .map((d) => ({ dateLabel: formatDateLabel(d.date), day: getDayOfWeekLabel(d.date), aov: Math.round(d.revenue / d.orderCount) })),
    [popupDailySales]
  );

  // 요일별 평균 매출 — 같은 요일이 여러 번이면 평균으로 집계, 월요일부터 표시
  const dayOfWeekData = useMemo(() => {
    const agg: Record<string, { total: number; count: number }> = {};
    for (const d of popupDailySales) {
      const label = getDayOfWeekLabel(d.date);
      if (!agg[label]) agg[label] = { total: 0, count: 0 };
      agg[label].total += d.revenue;
      agg[label].count += 1;
    }
    return WEEKDAY_ORDER.filter((day) => agg[day]?.count).map((day) => ({
      day,
      avgRevenue: Math.round(agg[day].total / agg[day].count),
      dayCount: agg[day].count,
    }));
  }, [popupDailySales]);

  const hourlyData = useMemo(() => buildHourlyData(popupRawOrders), [popupRawOrders]);
  const hasHourlyData = useMemo(() => hourlyData.some((h) => h.orderCount > 0), [hourlyData]);

  const menuShareData = useMemo(
    () => popupMenuBreakdown.filter((m) => m.totalRevenue > 0),
    [popupMenuBreakdown]
  );
  const menuShareTotal = useMemo(() => menuShareData.reduce((s, m) => s + m.totalRevenue, 0), [menuShareData]);

  const popupMenuChartHeight = useMemo(() => Math.max(180, popupMenuBreakdown.length * 38), [popupMenuBreakdown.length]);

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
        <p className="m-0 text-ink-faint text-sm">등록된 팝업이 없습니다. 일정 탭에서 팝업을 먼저 생성하세요.</p>
      ) : (
        <>
          <select
            value={selectedPopupId ?? ''}
            onChange={(e) => onSelectPopup(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-[#d8e8e0] rounded-lg px-3 py-2.5 text-sm font-semibold bg-canvas text-ink-secondary outline-none focus:border-primary-700 mb-4"
          >
            <option value="">팝업을 선택하세요</option>
            {popupEvents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.start_date} ~ {p.end_date})
              </option>
            ))}
          </select>

          {selectedPopup && period && (
            isLoading ? (
              <p className="text-ink-faint text-sm text-center py-6">데이터를 불러오는 중...</p>
            ) : (
              <>
                {/* 운영 기간 진행률 */}
                <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4] mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="m-0 text-sm font-bold text-ink-secondary">운영 진행률</h4>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                        period.status === '진행중'
                          ? 'bg-primary-700/10 text-primary-700 border-primary-700/30'
                          : period.status === '종료'
                            ? 'bg-[#f5f6f7] text-ink-muted border-hairline'
                            : 'bg-sky-50 text-sky-600 border-sky-200'
                      }`}>
                        {period.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-ink-muted font-medium">
                      {selectedPopup.start_date} ~ {selectedPopup.end_date}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#e8efeb] overflow-hidden mb-1.5">
                    <div
                      className="h-full rounded-full bg-primary-700 transition-all"
                      style={{ width: `${Math.round((period.elapsedDays / period.totalDays) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-ink-muted">
                    <span>현재 운영 <b className="text-ink-secondary">{period.elapsedDays}일</b> / 총 {period.totalDays}일</span>
                    <span>{period.status === '종료' ? '운영 종료' : `잔여 ${period.remainingDays}일`}</span>
                  </div>
                </div>

                {/* 핵심 지표 */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <StatTile label="총 매출" value={`₩${formatPrice(popupTotalRevenue)}`} accent />
                  <StatTile label="총 주문" value={`${popupTotalOrders}건`} />
                  <StatTile label="평균 객단가" value={derived.avgOrderValue > 0 ? `₩${formatPrice(derived.avgOrderValue)}` : '-'} />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <StatTile
                    label="운영일수 평균 매출"
                    value={derived.avgDailyRevenue > 0 ? `₩${formatPrice(derived.avgDailyRevenue)}` : '-'}
                    sub={period.elapsedDays > 0 ? `운영 ${period.elapsedDays}일 기준` : undefined}
                    accent
                  />
                  <StatTile
                    label="일평균 주문"
                    value={derived.avgDailyOrders > 0 ? `${derived.avgDailyOrders.toFixed(1)}건` : '-'}
                  />
                  <StatTile label="판매 발생일" value={`${derived.salesDays}일`} sub={period.elapsedDays > 0 ? `운영 ${period.elapsedDays}일 중` : undefined} />
                </div>
                <div className={`grid ${derived.projectedTotal != null ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-4`}>
                  <StatTile
                    label="최고 매출일"
                    value={derived.bestDay ? `₩${formatPrice(derived.bestDay.revenue)}` : '-'}
                    sub={derived.bestDay ? formatDateLabel(derived.bestDay.date) : undefined}
                  />
                  <StatTile
                    label="최저 매출일"
                    value={derived.worstDay ? `₩${formatPrice(derived.worstDay.revenue)}` : '-'}
                    sub={derived.worstDay ? formatDateLabel(derived.worstDay.date) : undefined}
                  />
                  {derived.projectedTotal != null && (
                    <StatTile
                      label="예상 총 매출"
                      value={`₩${formatPrice(derived.projectedTotal)}`}
                      sub="현재 일평균 기준"
                      accent
                    />
                  )}
                </div>

                <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
                {popupDailySales.length > 0 ? (
                  <>
                    <ChartCard title="일별 매출 추이">
                      <ResponsiveContainer width="100%" height={216}>
                        <BarChart data={dailyChartData} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip content={<DailyTooltip />} />
                          {derived.avgDailyRevenue > 0 && (
                            <ReferenceLine
                              y={derived.avgDailyRevenue}
                              stroke="#f59e0b"
                              strokeDasharray="4 4"
                              label={{ value: `평균 ${formatRevenueTick(derived.avgDailyRevenue)}`, position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
                            />
                          )}
                          <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                            {dailyChartData.map((d) => (
                              <Cell key={d.dateLabel} fill={weekendAccentColor(d.day, '#3d9966')} />
                            ))}
                            <LabelList dataKey="revenue" position="top" formatter={(v: number) => formatRevenueTick(v)} style={{ fontSize: 10, fill: '#555' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-[10px] text-ink-faint mt-1 m-0">※ 파란 막대는 토요일, 빨간 막대는 일요일</p>
                    </ChartCard>

                    <ChartCard title="누적 매출 추이">
                      <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={cumulativeData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as { cumulative: number; daily: number; pace: number };
                              const diff = row.cumulative - row.pace;
                              return (
                                <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
                                  <p className="font-bold mb-1 text-ink-secondary">{label}</p>
                                  <p className="text-primary-700">누적 ₩{row.cumulative.toLocaleString('ko-KR')}</p>
                                  <p className="text-ink-muted">당일 ₩{row.daily.toLocaleString('ko-KR')}</p>
                                  <p className={diff >= 0 ? 'text-primary-700 m-0' : 'text-rose-500 m-0'}>
                                    평균 페이스 대비 {diff >= 0 ? '+' : '−'}₩{Math.abs(diff).toLocaleString('ko-KR')}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="daily" fillOpacity={0.25} radius={[4, 4, 0, 0]}>
                            {cumulativeData.map((d) => (
                              <Cell key={d.dateLabel} fill={weekendAccentColor(d.day, '#3d9966')} />
                            ))}
                          </Bar>
                          <Line type="monotone" dataKey="pace" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />
                          <Area type="monotone" dataKey="cumulative" stroke="#3d9966" strokeWidth={2} fill="#3d9966" fillOpacity={0.08} dot={{ r: 3, strokeWidth: 0, fill: '#3d9966' }} activeDot={{ r: 5, strokeWidth: 0 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <p className="text-[10px] text-ink-faint mt-1 m-0">※ 옅은 막대는 일별 매출, 주황 점선은 평균 페이스 — 초록 선이 점선 위면 평균보다 앞선 페이스</p>
                    </ChartCard>

                    {aovTrendData.length > 0 && (
                      <ChartCard title="일별 객단가 추이">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={aovTrendData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={40} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
                                    <p className="font-bold mb-1 text-ink-secondary">{label}</p>
                                    <p className="text-primary-700 m-0">객단가 ₩{Number(payload[0].value).toLocaleString('ko-KR')}</p>
                                  </div>
                                );
                              }}
                            />
                            {derived.avgOrderValue > 0 && (
                              <ReferenceLine y={derived.avgOrderValue} stroke="#f59e0b" strokeDasharray="4 4" />
                            )}
                            <Line
                              type="monotone"
                              dataKey="aov"
                              stroke="#6366f1"
                              strokeWidth={2}
                              dot={(props: { cx?: number; cy?: number; index?: number; payload: { day: DayLabel } }) => {
                                const { cx, cy, index, payload } = props;
                                if (cx == null || cy == null) return <></>;
                                return <circle key={`aov-dot-${index}`} cx={cx} cy={cy} r={3} fill={weekendAccentColor(payload.day, '#6366f1')} />;
                              }}
                              activeDot={{ r: 5, strokeWidth: 0 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                        <p className="text-[10px] text-ink-faint mt-1 m-0">※ 주황 점선은 전체 기간 평균 객단가</p>
                      </ChartCard>
                    )}

                    {dayOfWeekData.length > 0 && (
                      <ChartCard title="요일별 평균 매출">
                        <ResponsiveContainer width="100%" height={196}>
                          <BarChart data={dayOfWeekData} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="day" tickFormatter={(d: string) => `${d}요일`} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={48} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const row = payload[0].payload as { day: string; avgRevenue: number; dayCount: number };
                                return (
                                  <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
                                    <p className="font-bold mb-1 text-ink-secondary">{row.day}요일 ({row.dayCount}일 평균)</p>
                                    <p className="text-primary-700 m-0">₩{row.avgRevenue.toLocaleString('ko-KR')}</p>
                                  </div>
                                );
                              }}
                            />
                            <Bar dataKey="avgRevenue" radius={[4, 4, 0, 0]}>
                              {dayOfWeekData.map((row) => (
                                <Cell key={row.day} fill={DAY_COLORS[row.day as DayLabel]} />
                              ))}
                              <LabelList dataKey="avgRevenue" position="top" formatter={(v: number) => formatRevenueTick(v)} style={{ fontSize: 10, fill: '#555' }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    )}
                  </>
                ) : (
                  <p className="lg:col-span-2 text-ink-faint text-sm">해당 팝업 기간에 매출 데이터가 없습니다.</p>
                )}

                {hasHourlyData && (
                  <ChartCard title="시간대별 매출 분포">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={hourlyData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={formatRevenueTick} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0].payload as { label: string; revenue: number; orderCount: number };
                            return (
                              <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
                                <p className="font-bold mb-1 text-ink-secondary">{row.label}</p>
                                <p className="text-primary-700">₩{row.revenue.toLocaleString('ko-KR')}</p>
                                <p className="text-ink-muted">주문 {row.orderCount}건</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] text-ink-faint mt-1 m-0">※ POS 주문 기준 (수기 입력 매출 제외)</p>
                  </ChartCard>
                )}

                {activeDays.length > 0 && (
                  <ChartCard
                    title="요일 × 시간대별 판매 현황"
                    className="lg:col-span-2"
                    right={
                      <div className="flex gap-1">
                        {(['revenue', 'orderCount'] as Metric[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setMetric(m)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-all ${metric === m ? 'bg-primary-700 text-white border-primary-700' : 'bg-[#f5f6f7] text-ink-muted border-hairline hover:bg-canvas-soft'}`}
                          >
                            {m === 'revenue' ? '매출' : '주문수'}
                          </button>
                        ))}
                      </div>
                    }
                  >
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
                            <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md min-w-[110px]">
                              <p className="font-bold mb-1.5 text-ink-secondary">{label}</p>
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
                    <p className="text-[10px] text-ink-faint mt-1">
                      {DAYS.filter((d) => !activeDays.includes(d as DayLabel)).length > 0
                        ? `※ 판매 없는 요일(${DAYS.filter((d) => !activeDays.includes(d as DayLabel)).join('·')})은 표시 생략`
                        : null}
                    </p>
                  </ChartCard>
                )}

                {menuShareData.length > 0 && (
                  <ChartCard title="메뉴별 매출 비중">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={menuShareData}
                          dataKey="totalRevenue"
                          nameKey="name"
                          innerRadius="52%"
                          outerRadius="80%"
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {menuShareData.map((item) => (
                            <Cell key={item.id} fill={item.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0].payload as MenuSalesItem;
                            const pct = menuShareTotal > 0 ? Math.round((row.totalRevenue / menuShareTotal) * 100) : 0;
                            return (
                              <div className="bg-canvas border border-hairline rounded-lg p-2.5 text-xs shadow-md">
                                <p className="font-bold mb-1 text-ink-secondary">{row.name}</p>
                                <p className="text-primary-700">₩{row.totalRevenue.toLocaleString('ko-KR')} ({pct}%)</p>
                                <p className="text-ink-muted">판매량 {row.totalQuantity}개</p>
                              </div>
                            );
                          }}
                        />
                        <Legend
                          formatter={(value: string) => <span style={{ fontSize: 11, color: '#555' }}>{value}</span>}
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ paddingTop: 8 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="m-0 text-sm font-bold text-ink-secondary">메뉴별 판매</h4>
                    <button
                      onClick={() => setShowMenuSalesEdit(true)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#f5f6f7] text-ink-muted border border-hairline hover:bg-canvas-soft cursor-pointer"
                    >
                      수기 입력
                    </button>
                  </div>
                  {popupMenuBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={popupMenuChartHeight}>
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
                  ) : (
                    <p className="m-0 text-ink-faint text-sm">메뉴 판매 내역이 없습니다.</p>
                  )}
                </div>
                </div>
              </>
            )
          )}
        </>
      )}

      {showMenuSalesEdit && selectedPopup && (
        <MenuSalesEditModal
          popupId={selectedPopup.id}
          popupName={selectedPopup.name}
          onClose={() => setShowMenuSalesEdit(false)}
          onSaved={() => { setShowMenuSalesEdit(false); onRefresh(); }}
        />
      )}
    </div>
  );
}
