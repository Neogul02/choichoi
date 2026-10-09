'use client';

import { useMemo } from 'react';
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

// 이 프로젝트의 primary 음영은 globals.css에 50·100·200·600·700·800만 정의돼 있다.
// 없는 음영(예: primary-500)을 쓰면 클래스가 통째로 무시되므로 선 색은 CSS 변수가 아닌 실제 색값으로 둔다.
const LINE_COLORS = ['#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#14b8a6'];
const MINE_COLOR = '#084431'; // primary-700 — 내 팝업은 등수 색 대신 브랜드 초록
const MEDALS = ['🥇', '🥈', '🥉'];

const VIEW_W = 300;
const VIEW_H = 92;
const PAD_T = 6;
const PAD_B = 14; // 시각 라벨 자리

/** 1,234,500 → 123만 (좁은 줄에 들어가도록 만 단위 반올림, 1만 미만은 그대로) */
function shortWon(n: number): string {
  if (n < 10000) return `₩${n.toLocaleString('ko-KR')}`;
  return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
}

/**
 * Catmull-Rom 스플라인을 베지어로 바꿔 둥근 곡선 path를 만든다.
 * 점이 2개뿐이면 직선. recharts를 쓰면 수백 KB가 POS 번들에 들어오는데,
 * POS는 결제 핫패스라 이 정도 곡선은 직접 그리는 편이 낫다.
 */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    // 장력 1/6 — 과하면 데이터에 없는 출렁임이 생겨 매출이 왜곡돼 보인다
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * 오늘 매출이 난 팝업이 둘 이상일 때만 뜨는 매출 배틀 칸.
 * 시간대별 누적 매출을 곡선으로 겹쳐 그려 추월이 보이게 한다.
 * 블라인드 상태를 오늘 매출 배너와 공유해 한 번 탭하면 같이 열린다.
 */
export default function SalesBattle({ rows, currentPopupId, hidden, onToggle }: Props) {
  const chart = useMemo(() => {
    if (rows.length < 2) return null;

    // 가로축은 "매출이 있었던 시각 범위" — 영업 전 빈 시간대까지 그리면 곡선이 왼쪽에 눌린다
    const hours = rows.flatMap(r => r.hourly.map(h => h.hour));
    if (hours.length === 0) return null;
    const from = Math.min(...hours);
    const to = Math.max(...hours);
    const span = Math.max(1, to - from);

    // 팝업별 누적 시계열 — 거래가 없던 시간대는 직전 누적을 유지한다(수평 구간)
    const series = rows.map(row => {
      const byHour = new Map(row.hourly.map(h => [h.hour, h.revenue]));
      let acc = 0;
      const points: Array<{ hour: number; value: number }> = [];
      for (let h = from; h <= to; h++) {
        acc += byHour.get(h) ?? 0;
        points.push({ hour: h, value: acc });
      }
      return { row, points, final: acc };
    });

    const peak = Math.max(1, ...series.map(s => s.final));
    const x = (h: number) => ((h - from) / span) * VIEW_W;
    const y = (v: number) => PAD_T + (1 - v / peak) * (VIEW_H - PAD_T - PAD_B);

    return {
      from,
      to,
      lines: series.map(s => ({
        row: s.row,
        d: smoothPath(s.points.map(p => ({ x: x(p.hour), y: y(p.value) }))),
      })),
    };
  }, [rows]);

  if (rows.length < 2 || !chart) return null;

  const leader = rows[0];
  const colorOf = (row: TodayPopupSales, i: number) =>
    row.popupId === currentPopupId ? MINE_COLOR : LINE_COLORS[i % LINE_COLORS.length];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={hidden ? '매출 배틀 보기' : '매출 배틀 가리기'}
      aria-pressed={hidden}
      className="w-full text-left rounded-xl border border-hairline bg-canvas px-3.5 py-3 mb-3 md:mb-4 cursor-pointer transition hover:border-primary-200"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="m-0 text-[10px] font-bold tracking-[0.12em] uppercase text-ink-faint">
          팝업별 매출
        </p>
        <span className="text-[10px] font-semibold text-ink-faint">
          {hidden ? '탭해서 보기' : `${chart.from}시 ~ ${chart.to}시 누적`}
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="w-full h-[92px] block"
          role="img"
          aria-label="팝업별 시간대 누적 매출 곡선"
        >
          {/* 가로 기준선 3줄 — 눈금 숫자 없이 높이 비교만 돕는다 */}
          {[0, 0.5, 1].map(t => {
            const gy = PAD_T + t * (VIEW_H - PAD_T - PAD_B);
            return <line key={t} x1={0} y1={gy} x2={VIEW_W} y2={gy} stroke="currentColor" className="text-hairline" strokeWidth={1} />;
          })}

          {chart.lines.map(({ row, d }, i) => {
            const isMine = row.popupId === currentPopupId;
            const color = colorOf(row, i);
            return (
              <g key={row.popupId}>
                <path
                  d={d}
                  fill="none"
                  stroke={hidden ? 'currentColor' : color}
                  className={hidden ? 'text-ink-faint/25' : undefined}
                  strokeWidth={isMine ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          <text x={0} y={VIEW_H - 3} className="fill-ink-faint" style={{ fontSize: 9 }}>{chart.from}시</text>
          <text x={VIEW_W} y={VIEW_H - 3} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 9 }}>{chart.to}시</text>
        </svg>
      </div>

      {/* 범례 — 곡선만으로는 정확한 금액을 알 수 없으므로 현재 합계를 같이 둔다 */}
      <div className="mt-2 flex flex-col gap-1">
        {rows.map((row, i) => {
          const isMine = row.popupId === currentPopupId;
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
                className="h-[3px] w-[14px] shrink-0 rounded-full"
                style={{ backgroundColor: hidden ? 'var(--color-hairline)' : colorOf(row, i) }}
              />
              <span
                className={`flex-1 min-w-0 truncate text-[11px] leading-tight ${
                  isMine ? 'font-extrabold text-primary-700' : 'font-semibold text-ink-secondary'
                }`}
                title={row.popupName}
              >
                {row.popupName}
                {isMine && !hidden && (
                  <span className="ml-1 rounded-full bg-primary-700 px-1 py-[1px] text-[8px] font-black tracking-wide text-white align-middle">
                    MY
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 text-right text-[11px] font-bold tabular-nums ${
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
    </button>
  );
}
