'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { fetchHourlySalesByPopup, fetchTodaysMenuSales } from '@/app/actions/orders';
import { kstNow, kstToday } from '@/lib/date';
import { kstDayBounds, mergeHourly, sumUpto } from '@/lib/salesCurve';
import type { MenuSalesItem, TodayPopupSales } from '@/types/api';

interface Props {
  /** 오늘 매출이 난 팝업별 집계 — 배틀 칸과 같은 쿼리 결과를 받는다 */
  rows: TodayPopupSales[];
  /** 이 POS가 속한 팝업 — 없으면(팝업 미지정) 전체 합산으로 본다 */
  currentPopupId: number | null;
  /** 위 배너가 보여주는 오늘 합계 — 객단가를 배너 숫자와 맞추려고 같은 값을 쓴다 */
  totalRevenue: number;
  totalOrders: number;
  /** 오늘 매출 배너와 같은 블라인드 상태를 공유한다 */
  hidden: boolean;
  onToggle: () => void;
}

// recharts는 무거우므로 배틀 칸과 같이 지연 로드한다 — 블라인드 상태에선 아예 불러오지도 않는다
const SalesBattleChart = dynamic(() => import('./SalesBattleChart'), {
  ssr: false,
  loading: () => <div className="h-[128px] rounded-lg bg-canvas-soft animate-pulse" />,
});

const MINE_COLOR = '#084431'; // primary-700 — 배틀 칸에서 내 팝업에 쓰는 색과 같다

/** kstNow()는 KST 벽시계를 UTC 필드에 담아 돌려주므로 getUTCHours()가 곧 KST 시각이다 */
const currentKstHour = () => kstNow().getUTCHours();

function Delta({ label, now, before }: { label: string; now: number; before: number | null }) {
  if (before == null || before === 0) {
    return <span className="text-ink-faint">{label} —</span>;
  }
  const diff = now - before;
  const pct = Math.round((diff / before) * 100);
  const up = diff >= 0;
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-faint">{label} </span>
      <span className={up ? 'font-bold text-emerald-600' : 'font-bold text-rose-500'}>
        {up ? '▲' : '▼'} {Math.abs(pct)}%
      </span>
      <span className="ml-1 text-ink-faint tabular-nums">(₩{before.toLocaleString('ko-KR')})</span>
    </span>
  );
}

/**
 * POS '오늘 현황' 칸 — 통계탭 오늘 현황의 축약판.
 * 매출 배틀은 팝업이 둘 이상일 때만 떠서, 한 곳만 도는 날엔 배너 숫자 두 개 말고는
 * 오늘 흐름을 볼 방법이 없었다. 이 칸은 팝업 수와 상관없이 항상 내 팝업 기준으로 뜬다.
 *
 * 비교(어제·지난주)는 통계탭과 같은 규칙 — 같은 시각까지의 누적끼리, orders 테이블만 본다.
 */
export default function PosTodaySummary({ rows, currentPopupId, totalRevenue, totalOrders, hidden, onToggle }: Props) {
  // 화면을 열어둔 채 시간이 넘어가면 비교 구간도 따라가야 한다
  const [nowHour, setNowHour] = useState(currentKstHour);
  useEffect(() => {
    const id = setInterval(() => setNowHour(currentKstHour()), 60_000);
    return () => clearInterval(id);
  }, []);

  const popupKey = currentPopupId == null ? null : String(currentPopupId);
  const scope = useCallback(
    (list: TodayPopupSales[]) =>
      currentPopupId == null ? list : list.filter(r => r.popupId === currentPopupId),
    [currentPopupId],
  );

  // 가려져 있는 동안엔 조회하지 않는다 — 결제 화면 왕복을 늘리지 않으려는 것
  const menuQuery = useQuery<MenuSalesItem[]>({
    queryKey: ['today-menu-sales', popupKey],
    queryFn: async () => {
      const res = await fetchTodaysMenuSales(popupKey);
      if (!res.success) throw new Error(res.error || '오늘 품목 조회 실패');
      return res.data ?? [];
    },
    enabled: !hidden,
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  // 기준일(어제·지난주 같은 요일)은 이미 끝난 날이라 하루에 한 번이면 충분하다.
  // 날짜를 키에 넣어 자정을 넘기면 새로 받는다.
  const today = kstToday();
  const compareQuery = useQuery<{ yesterday: TodayPopupSales[]; lastWeek: TodayPopupSales[] }>({
    queryKey: ['sales-compare-days', today],
    queryFn: async () => {
      const y = kstDayBounds(today, -1);
      const w = kstDayBounds(today, -7);
      const [yRes, wRes] = await Promise.all([
        fetchHourlySalesByPopup(y.startISO, y.endISO),
        fetchHourlySalesByPopup(w.startISO, w.endISO),
      ]);
      // 비교는 보조 정보다 — 실패해도 화면을 막지 않고 비교만 생략한다
      return {
        yesterday: yRes.success && yRes.data ? yRes.data : [],
        lastWeek: wRes.success && wRes.data ? wRes.data : [],
      };
    },
    enabled: !hidden,
    staleTime: 60 * 60_000,
  });

  const mine = useMemo(() => scope(rows), [rows, scope]);
  const todayUptoNow = sumUpto(mine, nowHour);

  const compare = useMemo(() => {
    if (!compareQuery.data) return null;
    const y = scope(compareQuery.data.yesterday);
    const w = scope(compareQuery.data.lastWeek);
    return {
      yesterday: y.length > 0 ? sumUpto(y, nowHour) : null,
      lastWeek: w.length > 0 ? sumUpto(w, nowHour) : null,
      yesterdayHourly: y.length > 0 ? mergeHourly(y) : null,
    };
  }, [compareQuery.data, scope, nowHour]);

  const breakdown = useMemo(
    () => [...(menuQuery.data ?? [])].sort((a, b) => b.totalQuantity - a.totalQuantity),
    [menuQuery.data],
  );
  const quantity = breakdown.reduce((s, m) => s + m.totalQuantity, 0);
  const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const maxQty = Math.max(1, ...breakdown.map(b => b.totalQuantity));

  return (
    <div className="rounded-xl border border-hairline bg-canvas px-3.5 py-3 mb-3 md:mb-4">
      {/* 차트 툴팁을 만지려면 카드 전체가 버튼이면 안 된다 — 머리말만 토글로 둔다 */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={hidden ? '오늘 현황 보기' : '오늘 현황 가리기'}
        aria-pressed={hidden}
        className="mb-2 flex w-full items-center justify-between bg-transparent border-none p-0 cursor-pointer"
      >
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink-faint">오늘 현황</span>
        <span className="text-[10px] font-semibold text-ink-faint">
          {hidden ? '탭해서 보기' : 'POS 결제 기준 · 탭해서 가리기'}
        </span>
      </button>

      {hidden ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label="오늘 현황 보기"
          className="flex h-[72px] w-full items-center justify-center rounded-lg border border-dashed border-hairline bg-canvas-soft/60 cursor-pointer text-[11px] font-semibold text-ink-faint"
        >
          오늘 현황이 가려져 있습니다
        </button>
      ) : (
        <>
          {/* 매출·주문 수는 바로 위 배너에 크게 있으므로 여기선 배너에 없는 두 값만 둔다 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '객단가', value: `₩${avgOrder.toLocaleString('ko-KR')}` },
              { label: '판매 수량', value: menuQuery.isPending ? '…' : `${quantity.toLocaleString('ko-KR')}개` },
            ].map(k => (
              <div key={k.label} className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2 text-center">
                <div className="mb-0.5 text-[10px] font-medium text-ink-muted">{k.label}</div>
                <div className="text-[15px] font-extrabold tabular-nums text-ink-secondary">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <Delta label="어제 같은 시각" now={todayUptoNow} before={compare?.yesterday ?? null} />
            <Delta label="지난주 같은 시각" now={todayUptoNow} before={compare?.lastWeek ?? null} />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="m-0 text-[10px] font-bold text-ink-muted">시간대별 누적</p>
              {compare?.yesterdayHourly && (
                <span className="flex items-center gap-1 text-[10px] text-ink-faint whitespace-nowrap">
                  <span className="inline-block h-0 w-3 border-t-2 border-dashed border-[#b4b0aa]" />
                  어제
                </span>
              )}
            </div>
            <SalesBattleChart
              rows={mine}
              currentPopupId={currentPopupId}
              colorOf={() => MINE_COLOR}
              reference={compare?.yesterdayHourly ? { label: '어제', hourly: compare.yesterdayHourly } : null}
            />
          </div>

          <div className="mt-3">
            <p className="m-0 mb-1.5 text-[10px] font-bold text-ink-muted">
              판매 품목 {breakdown.length > 0 && <span className="font-semibold text-ink-faint">· {breakdown.length}종</span>}
            </p>
            {menuQuery.isPending ? (
              <div className="h-20 rounded-lg bg-canvas-soft animate-pulse" />
            ) : menuQuery.isError ? (
              <p className="m-0 py-3 text-center text-[11px] text-ink-faint">품목을 불러오지 못했습니다.</p>
            ) : breakdown.length === 0 ? (
              <p className="m-0 py-3 text-center text-[11px] text-ink-faint">아직 판매된 품목이 없습니다.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-hairline">
                {breakdown.map((item, i) => (
                  <div
                    key={item.id}
                    className={`relative flex items-center gap-2 px-2.5 py-1.5 ${i !== breakdown.length - 1 ? 'border-b border-hairline' : ''}`}
                  >
                    {/* 수량 비중을 옅은 배경 막대로 — 숫자를 읽기 전에 분포가 먼저 보인다 */}
                    <div
                      className="absolute inset-y-0 left-0 bg-primary-50"
                      style={{ width: `${(item.totalQuantity / maxQty) * 100}%` }}
                    />
                    <span className="relative w-[16px] shrink-0 text-center text-[10px] font-bold text-ink-faint tabular-nums">
                      {i + 1}
                    </span>
                    <span className="relative min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">{item.name}</span>
                    <span className="relative shrink-0 text-[12px] font-extrabold text-primary-700 tabular-nums">
                      {item.totalQuantity.toLocaleString('ko-KR')}개
                    </span>
                    <span className="relative w-[64px] shrink-0 text-right text-[11px] text-ink-muted tabular-nums">
                      ₩{item.totalRevenue.toLocaleString('ko-KR')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
