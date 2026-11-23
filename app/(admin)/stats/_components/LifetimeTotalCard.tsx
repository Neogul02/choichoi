'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLifetimeSalesTotals } from '@/app/actions/stats';
import { formatPrice } from '@/lib/utils';
import type { LifetimeSalesTotals } from '@/types/api';

/** 2026-04-03 → 26.4.3 — 좁은 줄에 기간을 넣을 때 */
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${y.slice(2)}.${Number(m)}.${Number(day)}`;
};

/**
 * 첫 팝업부터 오늘까지의 누적 매출 — 통계탭 맨 아래 한 줄 요약.
 * 화면에 닿을 때만 조회한다(전체 기간 집계라 첫 화면 로딩에 묶지 않는다).
 * 집계 규칙은 달력(get_monthly_sales_by_date)과 같다: 날짜별로 수동 입력 매출이 POS를 대체한다.
 */
export default function LifetimeTotalCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const { data: totals, isPending } = useQuery<LifetimeSalesTotals | null>({
    queryKey: ['lifetime-sales-totals'],
    queryFn: async () => {
      const res = await fetchLifetimeSalesTotals();
      return res.success ? res.data ?? null : null;
    },
    enabled: visible,
    staleTime: 10 * 60_000,
  });

  if (visible && !isPending && (!totals || totals.dayCount === 0)) return null;

  const period = totals?.firstDate && totals.lastDate
    ? `${shortDate(totals.firstDate)} ~ ${shortDate(totals.lastDate)}`
    : null;

  return (
    <div ref={ref} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas px-4 py-2.5 shadow-level-1 min-h-[58px]">
      {!totals ? (
        <div className="h-[34px] w-full rounded-lg bg-canvas-soft animate-pulse" />
      ) : (
        <>
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold tracking-[0.12em] uppercase text-primary-600">누적 총매출</p>
            <p className="m-0 mt-0.5 text-[11px] text-ink-faint truncate tabular-nums">
              {period && <>{period} · </>}팝업 {totals.popupCount}개 · 영업 {totals.dayCount}일
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[18px] md:text-[20px] font-black leading-none text-primary-700 tabular-nums">
              ₩{formatPrice(totals.totalRevenue)}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] font-semibold text-ink-muted tabular-nums">
              <span>{totals.totalOrders.toLocaleString('ko-KR')}건</span>
              {totals.sandoCount > 0 && (
                <>
                  <span className="text-ink-faint">·</span>
                  {/* 부자재(아이스팩·보냉백)는 빼고 메뉴명에 '산도'가 들어간 것만 센다 */}
                  <span className="text-primary-600">🥪 {totals.sandoCount.toLocaleString('ko-KR')}개</span>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
