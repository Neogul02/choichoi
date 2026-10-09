'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fetchTodaysSalesByPopup } from '@/app/actions/orders';
import { fetchMenuSalesBreakdown, fetchDailySalesByPeriod } from '@/app/actions/stats';
import { kstToday } from '@/lib/date';
import type { MenuSalesItem, TodayPopupSales, DailySalesItem } from '@/types/api';

/** 'all'이면 오늘 매출이 난 팝업 전체 합산 */
export type TodayScope = number | 'all';

export interface TodayComparison {
  /** 어제 같은 범위의 매출 — 데이터가 없으면 null */
  yesterday: number | null;
  /** 지난주 같은 요일 매출 — 데이터가 없으면 null */
  lastWeek: number | null;
}

const addDays = (dateStr: string, delta: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

/** created_at은 naive UTC 컬럼이라 KST 경계를 UTC로 환산해 넘겨야 9시간이 어긋나지 않는다 */
const kstBounds = (fromStr: string, toStr: string) => ({
  startISO: new Date(`${fromStr}T00:00:00+09:00`).toISOString(),
  endISO: new Date(`${toStr}T23:59:59.999+09:00`).toISOString(),
});

/**
 * 통계탭 "오늘" 섹션 데이터.
 * 팝업을 골라 오늘 하루의 매출·주문·판매 품목·시간대 흐름을 한 번에 본다.
 *
 * 비교값(어제·지난주)은 orders 테이블만 본다 — 수동 입력 매출(daily_sales)은 날짜 단위라
 * 팝업별로 나눌 수 없어서, 팝업을 고른 상태와 전체 상태의 기준이 달라지면 더 헷갈린다.
 */
export function useToday(initialPopups?: TodayPopupSales[] | null) {
  const [popups, setPopups] = useState<TodayPopupSales[]>(initialPopups ?? []);
  const [scope, setScope] = useState<TodayScope>('all');
  const [breakdown, setBreakdown] = useState<MenuSalesItem[]>([]);
  const [comparison, setComparison] = useState<TodayComparison>({ yesterday: null, lastWeek: null });
  const [isLoading, setIsLoading] = useState(true);

  const loadPopups = useCallback(async () => {
    const res = await fetchTodaysSalesByPopup();
    if (res.success && res.data) setPopups(res.data);
    else if (!res.success) toast.error(`오늘 팝업별 매출 조회 실패: ${res.error}`);
  }, []);

  useEffect(() => {
    if (initialPopups != null) return;
    loadPopups();
  }, [initialPopups, loadPopups]);

  // 선택한 범위의 판매 품목 + 비교값
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setIsLoading(true);
      const today = kstToday();
      const popupId = scope === 'all' ? null : String(scope);
      const todayRange = kstBounds(today, today);
      // 지난주 같은 요일부터 어제까지 한 번에 받아 두 날짜를 골라 쓴다 — 왕복을 줄인다
      const pastRange = kstBounds(addDays(today, -7), addDays(today, -1));

      const [menuRes, pastRes] = await Promise.all([
        fetchMenuSalesBreakdown(todayRange.startISO, todayRange.endISO, popupId),
        fetchDailySalesByPeriod(pastRange.startISO, pastRange.endISO, popupId),
      ]);
      if (!alive) return;

      if (menuRes.success && menuRes.data) setBreakdown(menuRes.data);
      else { setBreakdown([]); if (!menuRes.success) toast.error(`오늘 메뉴 조회 실패: ${menuRes.error}`); }

      if (pastRes.success && pastRes.data) {
        const byDate = new Map((pastRes.data as DailySalesItem[]).map(d => [d.date, d.revenue]));
        setComparison({
          yesterday: byDate.get(addDays(today, -1)) ?? null,
          lastWeek: byDate.get(addDays(today, -7)) ?? null,
        });
      } else {
        setComparison({ yesterday: null, lastWeek: null });
      }
      setIsLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [scope]);

  // 선택 범위의 합계 — 팝업별 행에서 파생시켜 KPI와 곡선이 같은 출처를 쓰게 한다
  const selected = useMemo(
    () => (scope === 'all' ? popups : popups.filter(p => p.popupId === scope)),
    [popups, scope],
  );
  const totals = useMemo(() => {
    const revenue = selected.reduce((s, p) => s + p.totalRevenue, 0);
    const orders = selected.reduce((s, p) => s + p.totalOrders, 0);
    const quantity = breakdown.reduce((s, m) => s + m.totalQuantity, 0);
    return { revenue, orders, quantity, avgOrder: orders > 0 ? Math.round(revenue / orders) : 0 };
  }, [selected, breakdown]);

  return { popups, selected, scope, setScope, breakdown, comparison, totals, isLoading, refresh: loadPopups };
}
