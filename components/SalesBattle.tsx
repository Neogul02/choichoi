'use client';

import dynamic from 'next/dynamic';
import type { TodayPopupSales } from '@/types/api';

interface Props {
  /** 오늘 매출이 난 팝업들 (매출 내림차순) — 2곳 미만이면 아무것도 그리지 않는다 */
  rows: TodayPopupSales[];
  /** 이 POS가 속한 팝업 — 내 선을 강조한다 */
  currentPopupId: number | null;
  /** 오늘 매출 배너와 같은 블라인드 상태를 공유한다 */
  hidden: boolean;
  onToggle: () => void;
}

// recharts는 수백 KB라 POS 초기 번들에 들어가면 결제 화면 로딩이 느려진다.
// 통계탭과 같은 방식으로 지연 로드한다 — 블라인드 상태에선 아예 불러오지도 않는다.
const SalesBattleChart = dynamic(() => import('./SalesBattleChart'), {
  ssr: false,
  loading: () => <div className="h-[128px] rounded-lg bg-canvas-soft animate-pulse" />,
});

// globals.css의 primary 음영은 50·100·200·600·700·800만 정의돼 있다.
// 없는 음영을 쓰면 클래스가 통째로 무시되므로 선 색은 실제 색값으로 둔다.
const LINE_COLORS = ['#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#14b8a6'];
const MINE_COLOR = '#084431'; // primary-700 — 내 팝업은 등수 색 대신 브랜드 초록
const MEDALS = ['🥇', '🥈', '🥉'];

/** 1,234,500 → 123만 (좁은 줄에 들어가도록 만 단위 반올림, 1만 미만은 그대로) */
function shortWon(n: number): string {
  if (n < 10000) return `₩${n.toLocaleString('ko-KR')}`;
  return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
}

/**
 * 오늘 매출이 난 팝업이 둘 이상일 때만 뜨는 매출 배틀 칸.
 * 시간대별 누적 매출을 곡선으로 겹쳐 그려 추월이 보이게 한다.
 * 블라인드 상태를 오늘 매출 배너와 공유해 한 번 탭하면 같이 열린다.
 */
export default function SalesBattle({ rows, currentPopupId, hidden, onToggle }: Props) {
  if (rows.length < 2) return null;

  const leader = rows[0];
  const colorOf = (row: TodayPopupSales, i: number) =>
    row.popupId === currentPopupId ? MINE_COLOR : LINE_COLORS[i % LINE_COLORS.length];

  return (
    <div className="rounded-xl border border-hairline bg-canvas px-3.5 py-3 mb-3 md:mb-4">
      {/* 차트 안에서 툴팁을 만지려면 카드 전체가 버튼이면 안 된다 — 머리말만 토글로 둔다 */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={hidden ? '매출 배틀 보기' : '매출 배틀 가리기'}
        aria-pressed={hidden}
        className="mb-2 flex w-full items-center justify-between bg-transparent border-none p-0 cursor-pointer"
      >
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-ink-faint">
          팝업별 매출
        </span>
        <span className="text-[10px] font-semibold text-ink-faint">
          {hidden ? '탭해서 보기' : '시간대별 누적 · 탭해서 가리기'}
        </span>
      </button>

      {hidden ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label="매출 배틀 보기"
          className="flex h-[128px] w-full items-center justify-center rounded-lg border border-dashed border-hairline bg-canvas-soft/60 cursor-pointer text-[11px] font-semibold text-ink-faint"
        >
          매출이 가려져 있습니다
        </button>
      ) : (
        <SalesBattleChart rows={rows} currentPopupId={currentPopupId} colorOf={colorOf} />
      )}

      {/* 현재 합계 막대 — 곡선은 흐름을, 막대는 지금 격차를 보여준다.
          막대 색이 곧 위 곡선의 색이라 범례 역할도 겸한다. */}
      <div className="mt-2 flex flex-col gap-1.5">
        {rows.map((row, i) => {
          const isMine = row.popupId === currentPopupId;
          // 1등을 100%로 둔 상대 길이. 0원이어도 0으로 나누지 않게 방어하고,
          // 아주 작은 값도 색이 보이도록 최소 폭을 준다.
          const pct = hidden
            ? 100 / rows.length
            : Math.max(4, (row.totalRevenue / Math.max(leader.totalRevenue, 1)) * 100);
          return (
            <div
              key={row.popupId}
              className={`flex items-center gap-2 rounded-lg py-0.5 ${
                isMine && !hidden ? 'bg-primary-50 ring-1 ring-primary-200 -mx-1 px-1' : ''
              }`}
            >
              <span className="w-[16px] shrink-0 text-center text-[11px] leading-none">
                {hidden ? '•' : (MEDALS[i] ?? `${i + 1}`)}
              </span>

              <span
                className={`w-[64px] shrink-0 truncate text-[11px] leading-tight ${
                  isMine ? 'font-extrabold text-primary-700' : 'font-semibold text-ink-secondary'
                }`}
                title={row.popupName}
              >
                {row.popupName}
              </span>

              <div className="relative h-[16px] flex-1 min-w-0 overflow-hidden rounded-full bg-canvas-soft">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: hidden ? 'var(--color-hairline)' : colorOf(row, i),
                  }}
                />
                {isMine && !hidden && (
                  // 막대가 진한 브랜드 초록이라 흰 알약 + 초록 글자가 대비가 가장 높다
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white px-1.5 py-[1px] text-[8px] font-black leading-[11px] tracking-wide text-primary-700 shadow-sm ring-1 ring-primary-700/25">
                    MY
                  </span>
                )}
              </div>

              <span
                className={`w-[52px] shrink-0 text-right text-[11px] font-bold tabular-nums ${
                  isMine ? 'text-primary-700' : 'text-ink-secondary'
                }`}
              >
                {hidden ? <span className="text-ink-faint/60">••••</span> : shortWon(row.totalRevenue)}
              </span>
            </div>
          );
        })}
      </div>

      {!hidden && (
        <p className="m-0 mt-2 text-[10px] font-semibold text-ink-faint">
          {rows[1] && leader.totalRevenue > rows[1].totalRevenue
            ? `${leader.popupName} 선두 · 2위와 ${shortWon(leader.totalRevenue - rows[1].totalRevenue)} 차이가 나요! 파이팅 🍊`
            : '선두 동점!'}
        </p>
      )}
    </div>
  );
}
