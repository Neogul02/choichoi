'use client';

import dynamic from 'next/dynamic';
import { formatPrice } from '@/lib/utils';
import SectionHeader from './SectionHeader';
import { useState } from 'react';
import { useToday, type TodayScope } from '../_hooks/useToday';
import SalesDelta from '@/components/SalesDelta';
import PastPopupCompare from '@/components/PastPopupCompare';
import type { TodayPopupSales } from '@/types/api';

// POS 배틀 칸과 같은 곡선을 쓴다 — recharts는 무거우므로 지연 로드한다
const SalesBattleChart = dynamic(() => import('@/components/SalesBattleChart'), {
  ssr: false,
  loading: () => <div className="h-[128px] rounded-lg bg-canvas-soft animate-pulse" />,
});

const LINE_COLORS = ['#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#14b8a6'];

interface Props {
  initialPopups: TodayPopupSales[] | null;
}

/**
 * 오늘 하루를 팝업별로 들여다보는 섹션.
 * 여러 팝업이 동시에 도는 날, 기존 화면은 "오늘=전체 합산" 아니면 "팝업=전체 기간"뿐이라
 * "오늘 이 팝업이 뭘 몇 개 팔았나"를 볼 방법이 없었다.
 */
export default function TodaySection({ initialPopups }: Props) {
  const { popups, selected, scope, setScope, breakdown, comparison, totals, todayUptoNow, yesterdayCurve, isLoading } =
    useToday(initialPopups);
  const [showAllMenu, setShowAllMenu] = useState(false);

  if (popups.length === 0) {
    return (
      <div className="mt-4">
        <SectionHeader title="오늘 현황" />
        <p className="m-0 py-6 text-center text-[13px] text-ink-faint">아직 오늘 매출이 없습니다.</p>
      </div>
    );
  }

  const chips: Array<{ key: TodayScope; label: string }> = [
    ...(popups.length > 1 ? [{ key: 'all' as TodayScope, label: '전체' }] : []),
    ...popups.map(p => ({ key: p.popupId as TodayScope, label: p.popupName })),
  ];
  const maxQty = Math.max(1, ...breakdown.map(b => b.totalQuantity));
  const sortedMenu = [...breakdown].sort((a, b) => b.totalQuantity - a.totalQuantity);
  const shownMenu = showAllMenu ? sortedMenu : sortedMenu.slice(0, 3);
  // '전체'일 때 매출은 위 오늘 매출 카드와 같은 숫자라 타일에서 뺀다 — 같은 숫자가 두 번 보이지 않게
  const kpis = [
    ...(scope === 'all' ? [] : [{ label: '매출', value: `₩${formatPrice(totals.revenue)}`, accent: true }]),
    { label: '주문', value: `${totals.orders.toLocaleString('ko-KR')}건`, accent: false },
    { label: '객단가', value: `₩${formatPrice(totals.avgOrder)}`, accent: false },
    { label: '판매 수량', value: `${totals.quantity.toLocaleString('ko-KR')}개`, accent: false },
  ];

  return (
    <div className="mt-4">
      <SectionHeader
        title="오늘 현황"
        right={<span className="text-[11px] text-ink-faint">POS 결제 기준</span>}
      />

      {chips.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map(c => (
            <button
              key={String(c.key)}
              type="button"
              onClick={() => setScope(c.key)}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
                scope === c.key
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-hairline bg-canvas-soft text-ink-muted hover:bg-[#ececeb]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* KPI — 매출·주문·객단가·판매 수량 */}
      <div className={`grid gap-2 ${kpis.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
        {kpis.map(k => (
          <div key={k.label} className="rounded-xl border border-hairline bg-canvas-soft px-3 py-2.5 text-center">
            <div className="mb-0.5 text-[11px] font-medium text-ink-muted">{k.label}</div>
            <div className={`text-[16px] font-extrabold tabular-nums ${k.accent ? 'text-primary-700' : 'text-ink-secondary'}`}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <SalesDelta label="어제 같은 시각" now={todayUptoNow} before={comparison.yesterday} />
        <SalesDelta label="지난주 같은 시각" now={todayUptoNow} before={comparison.lastWeek} />
      </div>
      {/* 팝업 하나를 고르면 같은 매장 지난 회차의 같은 운영 일차와도 맞댄다 */}
      {scope !== 'all' && <PastPopupCompare currentPopupId={scope} todayUptoNow={todayUptoNow} />}

      {/* 시간대 흐름 — 전체면 팝업끼리 겹쳐 비교, 개별이면 한 줄. 어제 같은 범위를 점선으로 뒤에 깐다 */}
      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <p className="m-0 text-[11px] font-bold text-ink-muted">시간대별 누적</p>
          {yesterdayCurve && (
            <span className="flex items-center gap-1 text-[10px] text-ink-faint whitespace-nowrap">
              {yesterdayCurve.hasData ? (
                <>
                  <span className="inline-block h-0 w-3 border-t-2 border-dashed border-[#b4b0aa]" />
                  어제 같은 시각 <span className="font-bold tabular-nums">₩{formatPrice(yesterdayCurve.uptoNow)}</span>
                </>
              ) : (
                '어제 이 팝업 매출 없음'
              )}
            </span>
          )}
        </div>
        <SalesBattleChart
          rows={selected}
          currentPopupId={scope === 'all' ? null : scope}
          colorOf={(row) => {
            const idx = popups.findIndex(p => p.popupId === row.popupId);
            return LINE_COLORS[(idx < 0 ? 0 : idx) % LINE_COLORS.length];
          }}
          reference={
            yesterdayCurve?.hasData ? { label: '어제', hourly: yesterdayCurve.hourly } : null
          }
        />
      </div>

      {/* 판매 품목 — 이 섹션의 핵심. 무엇이 몇 개 나갔는지 */}
      <div className="mt-3">
        <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted">
          판매 품목 {breakdown.length > 0 && <span className="font-semibold text-ink-faint">· {breakdown.length}종</span>}
        </p>
        {isLoading ? (
          <div className="h-24 rounded-lg bg-canvas-soft animate-pulse" />
        ) : breakdown.length === 0 ? (
          <p className="m-0 py-4 text-center text-[12px] text-ink-faint">판매된 품목이 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-hairline">
            {shownMenu.map((item, i) => (
                <div
                  key={item.id}
                  className={`relative flex items-center gap-2 px-3 py-2 ${i !== shownMenu.length - 1 ? 'border-b border-hairline' : ''}`}
                >
                  {/* 수량 비중을 옅은 배경 막대로 — 숫자를 읽기 전에 분포가 먼저 보인다 */}
                  <div
                    className="absolute inset-y-0 left-0 bg-primary-50"
                    style={{ width: `${(item.totalQuantity / maxQty) * 100}%` }}
                  />
                  <span className="relative w-[18px] shrink-0 text-center text-[11px] font-bold text-ink-faint tabular-nums">
                    {i + 1}
                  </span>
                  <span className="relative min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {item.name}
                  </span>
                  <span className="relative shrink-0 text-[13px] font-extrabold text-primary-700 tabular-nums">
                    {item.totalQuantity.toLocaleString('ko-KR')}개
                  </span>
                  <span className="relative w-[72px] shrink-0 text-right text-[12px] text-ink-muted tabular-nums">
                    ₩{formatPrice(item.totalRevenue)}
                  </span>
                </div>
              ))}
          </div>
        )}
        {sortedMenu.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllMenu(v => !v)}
            className="mt-1.5 w-full rounded-lg border border-hairline bg-canvas-soft py-1.5 text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-[#ececeb]"
          >
            {showAllMenu ? '접기' : `전체 ${sortedMenu.length}종 보기`}
          </button>
        )}
      </div>
    </div>
  );
}
