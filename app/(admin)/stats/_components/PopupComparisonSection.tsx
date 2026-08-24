'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { formatRevenueTick, formatPrice } from '@/lib/utils';
import { CHART_GRID_STROKE, CHART_TICK_STYLE, CHART_VALUE_LABEL_STYLE, CHART_ACCENT_PRIMARY, CHART_ACCENT_GOLD } from '@/app/(admin)/stats/_lib/chartTheme';
import { getPopupPeriod, POPUP_STATUS_BADGE_CLASS } from '@/lib/popupPeriod';
import { usePopupComparison, type PopupComparisonRow } from '@/app/(admin)/stats/_hooks/usePopupComparison';
import ChartTooltipCard from './ChartTooltipCard';
import type { PopupEvent } from '@/types/database';

type SortKey = 'avgDailyRevenue' | 'totalRevenue' | 'totalOrders' | 'avgOrderValue';

const SORT_LABELS: Record<SortKey, string> = {
  avgDailyRevenue: '일평균 매출',
  totalRevenue: '총 매출',
  totalOrders: '총 주문',
  avgOrderValue: '객단가',
};

interface Props {
  popupEvents: PopupEvent[];
}

// 팝업이 쌓인 뒤에야 의미 있는 화면 — 팝업끼리 실적을 나란히 놓고 어디가 잘 됐는지 비교한다.
// 총매출은 운영일수가 다르면 불공정한 비교라 기본 정렬은 일평균 매출(정규화 지표)로 둔다.
export default function PopupComparisonSection({ popupEvents }: Props) {
  // 기본 비교 대상 = 진행중 팝업 기준 그 이전(과거) 것들 — 아직 시작 안 한 예정 팝업은 비교할 실적이
  // 없어 기본 선택에서 제외한다 (popupEvents는 start_date 내림차순이라 필터 후에도 최신순 유지)
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    const startedOnly = popupEvents.filter((p) => getPopupPeriod(p).status !== '예정');
    return (startedOnly.length > 0 ? startedOnly : popupEvents).slice(0, 6).map((p) => p.id);
  });
  const [sortKey, setSortKey] = useState<SortKey>('avgDailyRevenue');

  const selectedPopups = useMemo(
    () => popupEvents.filter((p) => selectedIds.includes(p.id)),
    [popupEvents, selectedIds]
  );
  const { rows, isLoading } = usePopupComparison(selectedPopups);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => b[sortKey] - a[sortKey]), [rows, sortKey]);

  // 같은 장소를 재방문해 팝업명이 중복될 수 있다 — 차트 라벨은 name이 아닌 id로 구분하고,
  // 중복된 이름에는 시작월을 붙여 어느 회차인지 눈으로도 구분되게 한다.
  const chartData = useMemo(() => {
    const nameCounts = new Map<string, number>();
    for (const r of sortedRows) nameCounts.set(r.popup.name, (nameCounts.get(r.popup.name) ?? 0) + 1);
    return sortedRows.map((r) => ({
      id: r.popup.id,
      name: nameCounts.get(r.popup.name)! > 1 ? `${r.popup.name} (${r.popup.start_date.slice(2, 7)})` : r.popup.name,
      value: r[sortKey],
      status: r.status,
    }));
  }, [sortedRows, sortKey]);

  // 선택 칩도 진행중 우선 정렬 — 방금 계산한 상태를 재사용
  const sortedChipPopups = useMemo(() => {
    const rank: Record<string, number> = { 진행중: 0, 예정: 1, 종료: 2 };
    return [...popupEvents].sort(
      (a, b) => rank[getPopupPeriod(a).status] - rank[getPopupPeriod(b).status] || b.start_date.localeCompare(a.start_date)
    );
  }, [popupEvents]);

  const toggle = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="bg-[#f4f7f5] rounded-xl p-4">
      <h3 className="m-0 mb-3 text-lg font-bold">팝업 비교</h3>
      {popupEvents.length === 0 ? (
        <p className="m-0 text-ink-faint text-sm">등록된 팝업이 없습니다.</p>
      ) : (
        <>
          <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4] mb-3">
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {sortedChipPopups.map((p) => {
                const checked = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-all ${
                      checked ? 'bg-primary-700 text-white border-primary-700' : 'bg-[#f5f6f7] text-ink-muted border-hairline hover:bg-canvas-soft'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-faint mt-1.5 m-0">{selectedIds.length}개 팝업 선택됨 — 클릭해서 추가/제외</p>
          </div>

          {selectedIds.length === 0 ? (
            <p className="m-0 text-ink-faint text-sm">비교할 팝업을 선택하세요.</p>
          ) : isLoading ? (
            <p className="text-ink-faint text-sm text-center py-6">데이터를 불러오는 중...</p>
          ) : (
            <>
              <div className="bg-canvas rounded-xl p-3 border border-[#e4e4e4] mb-3">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="m-0 text-sm font-bold text-ink-secondary">{SORT_LABELS[sortKey]} 비교</h4>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => setSortKey(k)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-all ${sortKey === k ? 'bg-primary-700 text-white border-primary-700' : 'bg-[#f5f6f7] text-ink-muted border-hairline hover:bg-canvas-soft'}`}
                      >
                        {SORT_LABELS[k]}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 40)}>
                  <BarChart layout="vertical" data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_GRID_STROKE} />
                    <XAxis type="number" tickFormatter={sortKey === 'totalOrders' ? String : formatRevenueTick} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 12, fill: 'var(--color-ink-secondary)' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as { name: string; value: number; status: string };
                        return (
                          <ChartTooltipCard>
                            <p className="font-bold mb-1 text-ink-secondary">{row.name} ({row.status})</p>
                            <p className="text-primary-700 m-0">
                              {SORT_LABELS[sortKey]}: {sortKey === 'totalOrders' ? `${row.value}건` : `₩${row.value.toLocaleString('ko-KR')}`}
                            </p>
                          </ChartTooltipCard>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {chartData.map((d) => (
                        <Cell key={d.id} fill={d.status === '진행중' ? CHART_ACCENT_PRIMARY : CHART_ACCENT_GOLD} fillOpacity={d.status === '종료' ? 0.55 : 1} />
                      ))}
                      <LabelList dataKey="value" position="right" formatter={(v: number) => (sortKey === 'totalOrders' ? `${v}건` : formatRevenueTick(v))} style={CHART_VALUE_LABEL_STYLE} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-ink-faint mt-1 m-0">※ 진한 막대는 진행중, 옅은 막대는 종료된 팝업</p>
              </div>

              <div className="bg-canvas rounded-xl border border-[#e4e4e4] overflow-x-auto">
                <table className="w-full text-[12px] border-collapse min-w-[560px]">
                  <thead>
                    <tr className="text-left text-ink-faint border-b border-hairline">
                      <th className="px-3 py-2 font-semibold">팝업</th>
                      <th className="px-3 py-2 font-semibold">상태</th>
                      <th className="px-3 py-2 font-semibold">기간</th>
                      <th className="px-3 py-2 font-semibold text-right">총 매출</th>
                      <th className="px-3 py-2 font-semibold text-right">총 주문</th>
                      <th className="px-3 py-2 font-semibold text-right">객단가</th>
                      <th className="px-3 py-2 font-semibold text-right">일평균 매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r: PopupComparisonRow) => (
                      <tr key={r.popup.id} className="border-b border-hairline last:border-0">
                        <td className="px-3 py-2 font-semibold text-ink-secondary whitespace-nowrap">{r.popup.name}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${POPUP_STATUS_BADGE_CLASS[r.status]}`}>{r.status}</span>
                        </td>
                        <td className="px-3 py-2 text-ink-faint whitespace-nowrap">{r.popup.start_date} ~ {r.popup.end_date} ({r.elapsedDays}/{r.totalDays}일)</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">₩{formatPrice(r.totalRevenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.totalOrders}건</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.avgOrderValue > 0 ? `₩${formatPrice(r.avgOrderValue)}` : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary-700">{r.avgDailyRevenue > 0 ? `₩${formatPrice(r.avgDailyRevenue)}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
