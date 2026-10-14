'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fetchTodaysSalesByPopup, fetchHourlySalesByPopup } from '@/app/actions/orders';
import { fetchMenuSalesBreakdown } from '@/app/actions/stats';
import { kstNow, kstToday } from '@/lib/date';
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

const addDays = (dateStr: string, delta: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

/** kstNow()는 KST 벽시계를 UTC 필드에 담아 돌려주므로 getUTCHours()가 곧 KST 시각이다 */
const currentKstHour = () => kstNow().getUTCHours();

/** 팝업 행들을 지정 시각까지 합산 — 오늘(진행 중)과 과거를 같은 잣대로 맞출 때 쓴다 */
const sumUpto = (rows: TodayPopupSales[], hourCap: number) =>
  rows.reduce(
    (sum, p) => sum + p.hourly.reduce((s, h) => (h.hour <= hourCap ? s + h.revenue : s), 0),
    0,
  );

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
  const [yesterdayRows, setYesterdayRows] = useState<TodayPopupSales[] | null>(null);
  const [lastWeekRows, setLastWeekRows] = useState<TodayPopupSales[] | null>(null);
  // 비교 기준이 되는 "지금 시각". 화면을 열어둔 채 시간이 넘어가면 비교 구간도 따라가야 한다 —
  // 예전엔 memo 의존성에 popups를 끼워 넣어 재계산을 유도했는데, 갱신이 없으면 시각이 멈췄다.
  const [nowHour, setNowHour] = useState(currentKstHour);
  useEffect(() => {
    const id = setInterval(() => setNowHour(currentKstHour()), 60_000);
    return () => clearInterval(id);
  }, []);
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

  // 비교 기준일(어제·지난주 같은 요일)의 팝업별 시간대 매출.
  // 하루 전체를 한 번만 받아두고 범위별 곡선·시각별 누적은 아래 memo에서 뽑는다 —
  // 칩을 바꿀 때마다 재조회하지 않는다(기준일 데이터는 scope와 무관하게 고정이다).
  useEffect(() => {
    let alive = true;
    const today = kstToday();
    const day = (delta: number) => {
      const d = addDays(today, delta);
      return kstBounds(d, d);
    };
    Promise.all([
      fetchHourlySalesByPopup(day(-1).startISO, day(-1).endISO),
      fetchHourlySalesByPopup(day(-7).startISO, day(-7).endISO),
    ]).then(([y, w]) => {
      if (!alive) return;
      // 비교는 보조 정보다 — 실패해도 토스트로 화면을 막지 않고 기준선만 생략한다
      setYesterdayRows(y.success && y.data ? y.data : []);
      setLastWeekRows(w.success && w.data ? w.data : []);
    });
    return () => { alive = false; };
  }, []);

  // 선택한 범위의 판매 품목 + 비교값
  useEffect(() => {
    let alive = true;
    const run = async () => {
      setIsLoading(true);
      const today = kstToday();
      const popupId = scope === 'all' ? null : String(scope);
      const todayRange = kstBounds(today, today);

      const menuRes = await fetchMenuSalesBreakdown(todayRange.startISO, todayRange.endISO, popupId);
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
    const byHour = new Map<number, number>();
    for (const r of rows) {
      for (const h of r.hourly) byHour.set(h.hour, (byHour.get(h.hour) ?? 0) + h.revenue);
    }
    const hourly = [...byHour.entries()]
      .map(([hour, revenue]) => ({ hour, revenue }))
      .sort((a, b) => a.hour - b.hour);
    const cap = nowHour;
    return {
      hourly,
      total: hourly.reduce((s, h) => s + h.revenue, 0),
      uptoNow: hourly.reduce((s, h) => (h.hour <= cap ? s + h.revenue : s), 0),
      hasData: true,
    };
  }, [yesterdayRows, scopeRows, nowHour]);

  /** 오늘 지금 시각까지의 누적 — 비교값과 같은 잣대 */
  const todayUptoNow = useMemo(() => sumUpto(selected, nowHour), [selected, nowHour]);

  return { popups, selected, scope, setScope, breakdown, comparison, totals, todayUptoNow, yesterdayCurve, isLoading, refresh: loadPopups };
}
