'use client';

import { formatPrice } from '@/lib/utils';
import type { LifetimeSalesTotals } from '@/types/api';

interface Props {
  totals: LifetimeSalesTotals | null;
}

/** 2026-04-03 → 26.4.3 — 좁은 줄에 기간을 넣을 때 */
const shortDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${y.slice(2)}.${Number(m)}.${Number(day)}`;
};

/**
 * 첫 팝업부터 오늘까지의 누적 매출 — 통계탭에만 두는 한 줄짜리 요약.
 * 집계 규칙은 달력(get_monthly_sales_by_date)과 같다: 날짜별로 수동 입력 매출이 POS를 대체한다.
 * 규칙이 갈리면 달력 월 합계를 모두 더한 값과 이 숫자가 달라진다.
 */
export default function LifetimeTotalCard({ totals }: Props) {
  if (!totals || totals.dayCount === 0) return null;

  const period = totals.firstDate && totals.lastDate
    ? `${shortDate(totals.firstDate)} ~ ${shortDate(totals.lastDate)}`
    : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas px-4 py-2.5 shadow-level-1">
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
        <div className="mt-1 text-[11px] font-semibold text-ink-muted tabular-nums">
          {totals.totalOrders.toLocaleString('ko-KR')}건
        </div>
      </div>
    </div>
  );
}
