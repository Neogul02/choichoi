'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSalesCompareDays } from '@/hooks/useSalesCompareDays';
import { fetchTodaysSalesByPopupForStats, fetchTodaysMenuSalesForStats } from '@/app/actions/stats';
import { kstToday } from '@/lib/date';
import { useKstHour } from '@/hooks/useKstHour';
import { mergeHourly, sumUpto } from '@/lib/salesCurve';
import type { MenuSalesItem, TodayPopupSales } from '@/types/api';

/** 'all'이면 오늘 매출이 난 팝업 전체 합산 */
export type TodayScope = number | 'all';

export interface TodayComparison {
  /** 어제 **같은 시각까지**의 누적 — 데이터가 없으면 null */
  yesterday: number | null;
  /** 지난주 같은 요일 **같은 시각까지**의 누적 — 데이터가 없으면 null */
  lastWeek: number | null;
}

/** 어제 같은 범위의 시간대별 매출 — 오늘 곡선 뒤에 겹쳐 그리는 기준선 */
export interface YesterdayCurve {
  /** KST 시각별 그 시간대 매출 (누적 아님 — 누적은 차트가 만든다) */
  hourly: { hour: number; revenue: number }[];
  /** 어제 하루 전체 합 */
  total: number;
  /** 어제 **지금 시각까지**의 누적 — 오늘과 맞대 놓고 비교할 수 있는 유일한 값 */
  uptoNow: number;
  /** 고른 팝업이 어제는 돌지 않았으면 false — "0원"과 "데이터 없음"은 다르다 */
  hasData: boolean;
}

/**
 * 통계탭 "오늘" 섹션 데이터.
 * 팝업을 골라 오늘 하루의 매출·주문·판매 품목·시간대 흐름을 한 번에 본다.
 *
 * 오늘 합계·판매 품목은 팝업 수기 정정(popup_daily_sales·manual_daily_menu_sales)을 덮은 값이다.
 * 비교값(어제·지난주)과 곡선은 orders 테이블만 본다 — 수기 입력엔 시각이 없어 시간대로 나눌 수 없다.
 */
export function useToday(initialPopups?: TodayPopupSales[] | null) {
  const [popups, setPopups] = useState<TodayPopupSales[]>(initialPopups ?? []);
  const [scope, setScope] = useState<TodayScope>('all');
  const [breakdown, setBreakdown] = useState<MenuSalesItem[]>([]);
  // 비교 기준이 되는 "지금 시각" — 1분마다 따라간다
  const nowHour = useKstHour();
  const [isLoading, setIsLoading] = useState(true);

  const loadPopups = useCallback(async () => {
    const res = await fetchTodaysSalesByPopupForStats();
    if (res.success && res.data) setPopups(res.data);
    else if (!res.success) toast.error(`오늘 팝업별 매출 조회 실패: ${res.error}`);
  }, []);

  useEffect(() => {
    if (initialPopups != null) return;
    loadPopups();
  }, [initialPopups, loadPopups]);

  // 비교 기준일(어제·지난주 같은 요일)의 팝업별 시간대 매출 — POS '오늘 현황'과 같은 캐시.
  // 하루 전체를 한 번만 받아두고 범위별 곡선·시각별 누적은 아래 memo에서 뽑는다(칩을 바꿔도 재조회 없음).
  const compareQuery = useSalesCompareDays(kstToday());
  const yesterdayRows = compareQuery.data?.yesterday ?? null;
  const lastWeekRows = compareQuery.data?.lastWeek ?? null;

  // 선택한 범위의 판매 품목 + 비교값
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setIsLoading(true);
      const menuRes = await fetchTodaysMenuSalesForStats(scope === 'all' ? null : scope);
      if (!alive) return;

      if (menuRes.success && menuRes.data) setBreakdown(menuRes.data);
      else { setBreakdown([]); if (!menuRes.success) toast.error(`오늘 메뉴 조회 실패: ${menuRes.error}`); }

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

  // 기준일을 고른 범위로 좁힌다 — 어제 안 돌았던 팝업을 고르면 빈 배열이 된다
  const scopeRows = useCallback(
    (rows: TodayPopupSales[] | null) =>
      rows == null ? null : scope === 'all' ? rows : rows.filter(r => r.popupId === scope),
    [scope],
  );

  // 비교는 **같은 시각까지의 누적**끼리 한다. 하루 전체 합과 맞대면 오전엔 늘 "폭망"으로 보인다.
  const comparison = useMemo<TodayComparison>(() => {
    const cap = nowHour;
    const y = scopeRows(yesterdayRows);
    const w = scopeRows(lastWeekRows);
    return {
      yesterday: y && y.length > 0 ? sumUpto(y, cap) : null,
      lastWeek: w && w.length > 0 ? sumUpto(w, cap) : null,
    };
  }, [yesterdayRows, lastWeekRows, scopeRows, nowHour]);

  // 어제 곡선 — 차트에 깔 점선 기준선. 곡선은 하루 전체를 그리되,
  // 숫자로 보여줄 값은 "지금 시각까지"여야 오늘과 맞대 비교가 된다.
  const yesterdayCurve = useMemo<YesterdayCurve | null>(() => {
    const rows = scopeRows(yesterdayRows);
    if (rows == null) return null;
    if (rows.length === 0) return { hourly: [], total: 0, uptoNow: 0, hasData: false };
    const hourly = mergeHourly(rows);
    const cap = nowHour;
    return {
      hourly,
      total: hourly.reduce((s, h) => s + h.revenue, 0),
      uptoNow: hourly.reduce((s, h) => (h.hour <= cap ? s + h.revenue : s), 0),
      hasData: true,
    };
  }, [yesterdayRows, scopeRows, nowHour]);

  /** 오늘 지금 시각까지의 누적 — 비교값과 같은 잣대 */
  // 정정한 팝업은 하루 시간대 입력이 없으면 시각별 값이 없다 — hourly로 더하면 0원이 돼 "어제 대비 -100%"로 보였다.
  // 그럴 땐 정정값(하루 전체)을 그대로 쓴다.
  const todayUptoNow = useMemo(
    () => selected.reduce((s, p) => s + (p.corrected && p.hourly.length === 0 ? p.totalRevenue : sumUpto([p], nowHour)), 0),
    [selected, nowHour],
  );

  return { popups, selected, scope, setScope, breakdown, comparison, totals, todayUptoNow, yesterdayCurve, isLoading, refresh: loadPopups };
}
