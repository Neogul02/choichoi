'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { toast } from 'sonner';
import { fetchPopupDayDetail, savePopupDailySales, removePopupDailySales, saveManualDailyMenuSales } from '@/app/actions/stats';
import { fetchMenuItems } from '@/app/actions/menu';
import { formatPrice, formatRevenueTick } from '@/lib/utils';
import { hourlyDiffersFromTotal } from '@/lib/dayDetail';
import { CHART_GRID_STROKE, CHART_TICK_STYLE, CHART_VALUE_LABEL_STYLE, CHART_ACCENT_PRIMARY } from '../_lib/chartTheme';
import ChartTooltipCard from './ChartTooltipCard';
import type { PopupDayDetail } from '@/types/api';
import type { MenuItem } from '@/types/database';

const num = (raw: string) => { const n = parseInt(raw.replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; };

/**
 * 하루 상세 창의 팝업 탭 — 그 팝업의 그날 매출·주문(정정값/POS), 시간대별 매출, 메뉴별 판매를 보고 바로 고친다.
 * 값의 우선순위(팝업 정정 > 날짜 전체 정정 > POS)는 서버 fetchPopupDayDetail(get_popup_day_sales)이 정한다.
 */
export default function PopupDayPanel({ popupId, date, onChanged }: {
  popupId: number;
  date: string;
  /** 저장 후 달력·팝업 통계를 다시 읽게 알린다(창은 닫지 않는다) */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<PopupDayDetail | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // 매출·주문 편집값 — 빈 칸은 "그대로"
  const [revenue, setRevenue] = useState('');
  const [orders, setOrders] = useState('');
  // 메뉴 수량 편집값 — menuItemId → 입력 문자열(빈 칸 = 그대로)
  const [qty, setQty] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([fetchPopupDayDetail(popupId, date), fetchMenuItems(popupId)]).then(([dRes, mRes]) => {
      if (!alive) return;
      if (dRes.success && dRes.data) setDetail(dRes.data);
      else { setDetail(null); toast.error(`하루 상세 조회 실패: ${dRes.success ? '' : dRes.error}`); }
      if (mRes.success && mRes.data) setMenuItems(mRes.data);
      setRevenue(''); setOrders(''); setQty({});
      setLoading(false);
    });
    return () => { alive = false; };
  }, [popupId, date, reloadKey]);

  // 메뉴 행 = 그날 팔린 메뉴 + 그 팝업에서 파는 메뉴(팔리지 않은 것도 수량을 넣을 수 있게)
  const menuRows = useMemo(() => {
    const sold = new Map((detail?.menu ?? []).map(m => [m.id, m]));
    const rows = (detail?.menu ?? []).map(m => ({ id: m.id, name: m.name, color: m.color, qty: m.totalQuantity, revenue: m.totalRevenue }));
    for (const m of menuItems) if (!sold.has(m.id) && m.price > 0) rows.push({ id: m.id, name: m.name, color: m.color, qty: 0, revenue: 0 });
    return rows;
  }, [detail, menuItems]);

  if (loading) return <p className="m-0 py-8 text-center text-sm text-ink-faint">불러오는 중...</p>;
  if (!detail) return <p className="m-0 py-8 text-center text-sm text-ink-faint">불러오지 못했습니다.</p>;

  const avg = detail.orders > 0 ? Math.round(detail.revenue / detail.orders) : 0;
  const chartData = detail.hourly.map(h => ({ label: `${h.hour}시`, revenue: h.revenue, orders: h.orders }));
  const hourlyMismatch = detail.hourlySource === 'pos' && hourlyDiffersFromTotal(detail.hourly, detail.revenue);
  const dirtyTotals = revenue !== '' || orders !== '';
  const dirtyMenu = Object.values(qty).some(v => v !== '');

  const saveAll = async () => {
    setSaving(true);
    const tasks: Promise<{ success: boolean; error?: string }>[] = [];
    if (dirtyTotals) {
      // 한 칸만 바꿨으면 다른 칸은 지금 값 그대로 — 0으로 덮지 않는다
      tasks.push(savePopupDailySales(popupId, date, revenue !== '' ? num(revenue) : detail.revenue, orders !== '' ? num(orders) : detail.orders));
    }
    if (dirtyMenu) {
      const entries = Object.entries(qty).filter(([, v]) => v !== '').map(([id, v]) => ({ menuItemId: Number(id), quantity: num(v) }));
      tasks.push(saveManualDailyMenuSales(popupId, date, entries));
    }
    const results = await Promise.all(tasks);
    setSaving(false);
    const failed = results.find(r => !r.success);
    if (failed) { toast.error(`저장 실패: ${failed.error}`); return; }
    toast.success('저장됐습니다');
    onChanged();
    setReloadKey(k => k + 1);
  };

  const resetToPos = async () => {
    setSaving(true);
    const res = await removePopupDailySales(popupId, date);
    setSaving(false);
    if (!res.success) { toast.error(`되돌리기 실패: ${res.error}`); return; }
    toast.success('POS 값으로 되돌렸습니다');
    onChanged();
    setReloadKey(k => k + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 매출·주문 — 지금 값(정정 또는 POS)을 보여 주고 그 자리에서 고친다 */}
      <section>
        <div className="grid grid-cols-3 gap-2">
          <label className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2">
            <span className="block text-[11px] font-semibold text-ink-faint">매출</span>
            <input
              inputMode="numeric"
              value={revenue === '' ? '' : num(revenue).toLocaleString('ko-KR')}
              onChange={e => setRevenue(e.target.value)}
              placeholder={formatPrice(detail.revenue)}
              aria-label="매출"
              className="w-full bg-transparent border-none outline-none text-[15px] font-extrabold text-ink tabular-nums placeholder:text-ink placeholder:opacity-100"
            />
          </label>
          <label className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2">
            <span className="block text-[11px] font-semibold text-ink-faint">주문</span>
            <input
              inputMode="numeric"
              value={orders}
              onChange={e => setOrders(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder={`${detail.orders.toLocaleString('ko-KR')}`}
              aria-label="주문 수"
              className="w-full bg-transparent border-none outline-none text-[15px] font-extrabold text-ink tabular-nums placeholder:text-ink placeholder:opacity-100"
            />
          </label>
          <div className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2">
            <span className="block text-[11px] font-semibold text-ink-faint">객단가</span>
            <span className="text-[15px] font-extrabold text-ink-secondary tabular-nums">{avg > 0 ? `₩${formatPrice(avg)}` : '-'}</span>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          {detail.corrected ? (
            <>
              <span className="font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">정정값</span>
              <span>POS 기록 ₩{formatPrice(detail.posRevenue)} · {detail.posOrders.toLocaleString('ko-KR')}건</span>
              <button type="button" onClick={resetToPos} disabled={saving} className="ml-auto bg-transparent border-none p-0 text-[11px] font-semibold text-rose-500 underline cursor-pointer disabled:opacity-50">
                POS 값으로 되돌리기
              </button>
            </>
          ) : (
            <span>POS 기록 그대로 · 숫자를 눌러 정산 값으로 고칠 수 있어요</span>
          )}
        </div>
      </section>

      {/* 시간대별 매출 */}
      <section>
        <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted">시간대별 매출</p>
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatRevenueTick} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={44} />
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
              {hourlyMismatch && ` · 시간대 합계(₩${formatPrice(detail.posRevenue)})는 정정된 하루 합계와 달라요`}
            </p>
          </>
        ) : (
          <p className="m-0 py-3 text-center text-[12px] text-ink-faint">이 날은 시간대별 기록이 없습니다.</p>
        )}
      </section>

      {/* 메뉴별 판매 — 수량을 바로 고친다(입력한 메뉴는 그 수량이 POS를 대신) */}
      <section>
        <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted">메뉴별 판매</p>
        <div className="overflow-hidden rounded-lg border border-hairline">
          {menuRows.map(m => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-hairline last:border-0 text-[13px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
              <span className={`flex-1 min-w-0 truncate ${m.qty > 0 ? 'text-ink-secondary' : 'text-ink-faint'}`}>{m.name}</span>
              <input
                inputMode="numeric"
                value={qty[m.id] ?? ''}
                onChange={e => setQty(p => ({ ...p, [m.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                placeholder={String(m.qty)}
                aria-label={`${m.name} 수량`}
                className="w-12 text-right bg-transparent border-none outline-none font-semibold text-ink tabular-nums placeholder:text-ink-muted"
              />
              <span className="text-[11px] text-ink-faint">개</span>
              <span className="w-20 shrink-0 text-right text-[12px] text-ink-muted tabular-nums">{m.revenue > 0 ? `₩${formatPrice(m.revenue)}` : ''}</span>
            </div>
          ))}
          {menuRows.length === 0 && <p className="m-0 py-3 text-center text-[12px] text-ink-faint">메뉴가 없습니다.</p>}
        </div>
        <p className="m-0 mt-1 text-[10px] text-ink-faint">
          수량을 입력한 메뉴는 그 수량이 POS 기록을 대신합니다 · 0을 넣으면 POS 기록으로 돌아갑니다
          {detail.menuCorrected && ' · 이 날은 수기 입력한 메뉴가 있어요'}
        </p>
      </section>

      <button
        type="button"
        onClick={saveAll}
        disabled={saving || (!dirtyTotals && !dirtyMenu)}
        className="w-full py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition-colors disabled:opacity-50 disabled:cursor-default"
      >
        {saving ? '저장 중...' : dirtyTotals || dirtyMenu ? '저장' : '바꾼 값 없음'}
      </button>
    </div>
  );
}
