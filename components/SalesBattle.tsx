'use client';

import { motion } from 'framer-motion';
import type { TodayPopupSales } from '@/types/api';

interface Props {
  /** 오늘 매출이 난 팝업들 (매출 내림차순) — 2곳 미만이면 아무것도 그리지 않는다 */
  rows: TodayPopupSales[];
  /** 이 POS가 속한 팝업 — 내 팝업 줄을 강조한다 */
  currentPopupId: number | null;
  /** 오늘 매출 배너와 같은 블라인드 상태를 공유한다 */
  hidden: boolean;
  onToggle: () => void;
}

const BAR_COLORS = ['bg-amber-400', 'bg-primary-500', 'bg-sky-400', 'bg-rose-400', 'bg-violet-400'];
const MEDALS = ['🥇', '🥈', '🥉'];

/** 1,234,500 → 123만 (좁은 줄에 들어가도록 만 단위 반올림, 1만 미만은 그대로) */
function shortWon(n: number): string {
  if (n < 10000) return `₩${n.toLocaleString('ko-KR')}`;
  return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`;
}

/**
 * 오늘 매출이 난 팝업이 둘 이상일 때만 뜨는 매출 배틀 칸.
 * 오늘 매출 배너 바로 아래에 붙으며, 블라인드 상태를 배너와 공유해 한 번 탭하면 같이 열린다.
 */
export default function SalesBattle({ rows, currentPopupId, hidden, onToggle }: Props) {
  if (rows.length < 2) return null;

  const leader = rows[0];
  // 막대 길이 기준 — 1등이 100%. 0원이어도 0으로 나누지 않게 방어한다
  const max = Math.max(leader.totalRevenue, 1);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={hidden ? '매출 배틀 보기' : '매출 배틀 가리기'}
      aria-pressed={hidden}
      className="w-full text-left rounded-xl border border-hairline bg-canvas px-3.5 py-3 mb-3 md:mb-4 cursor-pointer transition hover:border-primary-300"
    >
      <div className="flex items-center justify-between mb-2.5">
        <p className="m-0 text-[10px] font-bold tracking-[0.12em] uppercase text-ink-faint">
          팝업별 매출
        </p>
        <span className="text-[10px] font-semibold text-ink-faint">
          {hidden ? '탭해서 보기' : `${rows.length}개 팝업`}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const isMine = row.popupId === currentPopupId;
          const pct = hidden ? 100 / rows.length : Math.max(3, (row.totalRevenue / max) * 100);
          return (
            // 내 팝업 줄은 행 전체를 강조한다 — 막대 안에만 표시하면 막대 색(노랑·초록)이나
            // 짧은 막대의 회색 트랙 위에서 글자가 묻혀 잘 보이지 않았다
            <div
              key={row.popupId}
              className={`flex items-center gap-2 rounded-lg py-0.5 ${
                isMine && !hidden ? 'bg-primary-50 ring-1 ring-primary-200 -mx-1 px-1' : ''
              }`}
            >
              <span className="w-[18px] shrink-0 text-center text-[12px] leading-none">
                {hidden ? '•' : (MEDALS[i] ?? `${i + 1}`)}
              </span>

              <span
                className={`w-[72px] shrink-0 truncate text-[11px] leading-tight ${
                  isMine ? 'font-extrabold text-primary-700' : 'font-semibold text-ink-secondary'
                }`}
                title={row.popupName}
              >
                {row.popupName}
              </span>

              <div className="relative h-[18px] flex-1 min-w-0 rounded-full bg-canvas-soft overflow-hidden">
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    hidden ? 'bg-ink-faint/20' : BAR_COLORS[i % BAR_COLORS.length]
                  }`}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
                {isMine && !hidden && (
                  // 어두운 알약 + 흰 테두리 — 밝은 막대(노랑)든 진한 막대(초록)든 회색 트랙이든 다 읽힌다
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-ink/85 px-1.5 py-[1px] text-[8px] font-black leading-[11px] tracking-wide text-white ring-1 ring-white/70">
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
    </button>
  );
}
