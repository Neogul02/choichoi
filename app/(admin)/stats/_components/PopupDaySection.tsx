'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { toast } from 'sonner';
import { fetchPopupDayDetail } from '@/app/actions/stats';
import { addDays, kstToday } from '@/lib/date';
import { formatPrice, formatRevenueTick } from '@/lib/utils';
import { DAY_NAMES, pickOngoingPopup } from '@/lib/staffing';
import { hourlyDiffersFromTotal } from '@/lib/dayDetail';
import { CHART_GRID_STROKE, CHART_TICK_STYLE, CHART_VALUE_LABEL_STYLE, CHART_ACCENT_PRIMARY } from '@/app/(admin)/stats/_lib/chartTheme';
import ChartTooltipCard from './ChartTooltipCard';
import PopupPicker from './PopupPicker';
import type { PopupDayDetail } from '@/types/api';
import type { PopupEvent } from '@/types/database';

interface Props {
  popupEvents: PopupEvent[];
  /** 팝업별 매출 분석에서 고른 팝업 — 처음 열 때 같은 팝업으로 맞춘다 */
  initialPopupId: number | null;
}

/** 팝업 기간 안에서 기본으로 볼 날 — 어제(하루가 끝난 가장 최근 날), 기간 밖이면 가까운 끝 */
function defaultDate(popup: PopupEvent, today: string): string {
  const yesterday = addDays(today, -1);
  if (yesterday < popup.start_date) return popup.start_date;
  if (yesterday > popup.end_date) return popup.end_date;
  return yesterday;
}

function dateLabel(date: string) {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${DAY_NAMES[new Date(date + 'T00:00:00').getDay()]})`;
}

/**
 * 통계탭 "날짜별 상세" — 팝업 하나의 지난 하루를 골라 시간대별 매출과 메뉴 판매를 본다.
 * 팝업별 매출 분석(기간 전체 합산)과 별개로, 특정 날 하루만 떼어 보는 용도다.
 * 합계는 전산 정정값이 우선이고, 시간대는 수기 입력 > POS(lib/dayDetail).
 */
export default function PopupDaySection({ popupEvents, initialPopupId }: Props) {
  const today = kstToday();
  const [popupId, setPopupId] = useState<number | null>(initialPopupId);
  const popup = popupEvents.find((p) => p.id === popupId) ?? null;
  const [date, setDate] = useState<string | null>(popup ? defaultDate(popup, today) : null);
  const [detail, setDetail] = useState<PopupDayDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 팝업 목록이 늦게 오거나 위에서 고른 팝업이 없으면 진행 중인 팝업(없으면 최신)으로 시작
  useEffect(() => {
    if (popupId != null || popupEvents.length === 0) return;
    const p = (initialPopupId != null ? popupEvents.find((e) => e.id === initialPopupId) : null)
      ?? pickOngoingPopup(popupEvents, today) ?? popupEvents[0];
    setPopupId(p.id);
    setDate(defaultDate(p, today));
  }, [popupEvents, popupId, initialPopupId, today]);

  // 오늘은 아직 진행 중이라 고를 수 있는 마지막 날은 오늘까지(오늘 흐름은 위 '오늘' 섹션이 실시간으로 보여준다)
  const maxDate = popup ? (popup.end_date < today ? popup.end_date : today) : today;

  useEffect(() => {
    if (popupId == null || date == null) return undefined;
    let alive = true;
    setIsLoading(true);
    fetchPopupDayDetail(popupId, date).then((res) => {
      if (!alive) return;
      if (res.success && res.data) setDetail(res.data);
      else { setDetail(null); toast.error(`날짜별 상세 조회 실패: ${res.error}`); }
      setIsLoading(false);
    });
    return () => { alive = false; };
  }, [popupId, date]);

  const selectPopup = (id: number | null) => {
    setPopupId(id);
    const p = popupEvents.find((e) => e.id === id);
    setDate(p ? defaultDate(p, today) : null);
  };
  const shift = (delta: number) => {
    if (!date || !popup) return;
    const next = addDays(date, delta);
    if (next < popup.start_date || next > maxDate) return;
    setDate(next);
  };

  const chartData = useMemo(
    () => (detail?.hourly ?? []).map((h) => ({ label: `${h.hour}시`, revenue: h.revenue, orders: h.orders })),
    [detail],
  );
  const menuTotal = useMemo(
    () => (detail?.menu ?? []).reduce((s, m) => ({ qty: s.qty + m.totalQuantity, revenue: s.revenue + m.totalRevenue }), { qty: 0, revenue: 0 }),
    [detail],
  );
  const avgOrder = detail && detail.orders > 0 ? Math.round(detail.revenue / detail.orders) : 0;
  const hourlyMismatch = detail != null && detail.hourlySource === 'pos' && hourlyDiffersFromTotal(detail.hourly, detail.revenue);

  return (
    <div className="bg-[#f4f7f5] rounded-xl p-4">
      <h3 className="m-0 text-lg font-bold">날짜별 상세</h3>
      <p className="m-0 mt-0.5 mb-3 text-[12px] text-ink-muted">지난 하루를 골라 시간대별 매출과 메뉴 판매를 봅니다.</p>
      {popupEvents.length === 0 ? (
        <p className="m-0 text-ink-faint text-sm">등록된 팝업이 없습니다.</p>
      ) : (
        <>
          <PopupPicker popupEvents={popupEvents} selectedPopupId={popupId} onSelectPopup={selectPopup} />

          {popup && date && (
            <>
              {/* 날짜 고르기 — 팝업 운영 기간 안에서만 */}
              <div className="flex items-center gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => shift(-1)}
                  disabled={date <= popup.start_date}
                  aria-label="전날"
                  className="w-9 h-9 rounded-xl bg-canvas border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-canvas-soft transition disabled:opacity-40 disabled:cursor-default"
                >‹</button>
                <input
                  type="date"
                  value={date}
                  min={popup.start_date}
                  max={maxDate}
                  onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
                  className="h-9 px-3 rounded-xl border border-hairline bg-canvas text-[13px] font-semibold text-ink outline-none focus:border-primary-700"
                />
                <button
                  type="button"
                  onClick={() => shift(1)}
                  disabled={date >= maxDate}
                  aria-label="다음날"
                  className="w-9 h-9 rounded-xl bg-canvas border border-hairline cursor-pointer font-bold text-ink-muted hover:bg-canvas-soft transition disabled:opacity-40 disabled:cursor-default"
                >›</button>
                <span className="ml-1 text-[13px] font-semibold text-ink-secondary whitespace-nowrap">{dateLabel(date)}</span>
              </div>

              {isLoading ? (
                <p className="text-ink-faint text-sm text-center py-6">불러오는 중...</p>
              ) : detail && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* 하루 합계 */}
                  <div className="lg:col-span-2 bg-canvas rounded-xl p-3 border border-[#e4e4e4]">
                    <div className="grid grid-cols-3 gap-2">
                      <Kpi label="매출" value={`₩${formatPrice(detail.revenue)}`} />
                      <Kpi label="주문" value={`${detail.orders.toLocaleString('ko-KR')}건`} />
                      <Kpi label="객단가" value={avgOrder > 0 ? `₩${formatPrice(avgOrder)}` : '-'} />
                    </div>
                    {detail.corrected && (
                      <p className="m-0 mt-2 text-[11px] text-ink-muted">
                        <span className="font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 mr-1">전산 정정값</span>
                        POS 기록은 ₩{formatPrice(detail.posRevenue)} · {detail.posOrders.toLocaleString('ko-KR')}건
                      </p>
                    )}
                  </div>

                  {/* 시간대별 매출 */}
                  <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4] min-w-0">
                    <h4 className="m-0 mb-3 text-sm font-bold text-ink-secondary">시간대별 매출</h4>
                    {chartData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={chartData} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
                            <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={formatRevenueTick} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={48} />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const row = payload[0].payload as { label: string; revenue: number; orders: number | null };
                                return (
                                  <ChartTooltipCard>
                                    <p className="font-bold mb-1 text-ink-secondary">{row.label}</p>
                                    <p className="text-primary-700">₩{row.revenue.toLocaleString('ko-KR')}</p>
                                    {row.orders != null && <p className="text-ink-muted m-0">주문 {row.orders}건</p>}
                                  </ChartTooltipCard>
                                );
                              }}
                            />
                            <Bar dataKey="revenue" fill={CHART_ACCENT_PRIMARY} radius={[4, 4, 0, 0]}>
                              {chartData.length <= 12 && (
                                <LabelList dataKey="revenue" position="top" formatter={(v: number) => (v > 0 ? formatRevenueTick(v) : '')} style={CHART_VALUE_LABEL_STYLE} />
                              )}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <p className="m-0 mt-1 text-[10px] text-ink-faint">
                          {detail.hourlySource === 'manual' ? '※ 시간대별 수기 입력 기준' : '※ POS 주문 기준'}
                          {hourlyMismatch && ` · 시간대 합계(₩${formatPrice(detail.posRevenue)})가 하루 합계와 달라요`}
                        </p>
                      </>
                    ) : (
                      <p className="m-0 text-ink-faint text-sm">이 날은 시간대별 기록이 없습니다.</p>
                    )}
                  </div>

                  {/* 메뉴별 판매 */}
                  <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4] min-w-0">
                    <h4 className="m-0 mb-3 text-sm font-bold text-ink-secondary">메뉴별 판매</h4>
                    {detail.menu.length > 0 ? (
                      <>
                        <div className="flex flex-col">
                          {detail.menu.map((m) => (
                            <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-hairline last:border-0 text-[13px]">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                              <span className="flex-1 min-w-0 truncate text-ink-secondary">{m.name}</span>
                              <span className="shrink-0 text-ink-muted tabular-nums">{m.totalQuantity}개</span>
                              <span className="shrink-0 w-24 text-right font-semibold text-ink tabular-nums">₩{formatPrice(m.totalRevenue)}</span>
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-2 text-[13px] font-bold">
                            <span className="flex-1 text-ink">합계</span>
                            <span className="shrink-0 text-ink-muted tabular-nums">{menuTotal.qty}개</span>
                            <span className="shrink-0 w-24 text-right text-primary-700 tabular-nums">₩{formatPrice(menuTotal.revenue)}</span>
                          </div>
                        </div>
                        {detail.menuCorrected && (
                          <p className="m-0 mt-1 text-[10px] text-ink-faint">※ 수기로 입력한 품목은 그 수량으로, 나머지는 POS 기준</p>
                        )}
                      </>
                    ) : (
                      <p className="m-0 text-ink-faint text-sm">이 날은 메뉴 판매 기록이 없습니다.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[11px] text-ink-faint font-semibold">{label}</p>
      <p className="m-0 mt-0.5 text-[16px] md:text-[18px] font-extrabold text-ink tabular-nums truncate">{value}</p>
    </div>
  );
}
