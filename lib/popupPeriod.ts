import { kstToday } from '@/lib/date';
import type { PopupEvent } from '@/types/database';

export type PopupStatus = '예정' | '진행중' | '종료';

export interface PopupPeriod {
  status: PopupStatus;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
}

// 팝업 운영 기간 진행률 — 통계 상세·비교 대시보드·인사 탭 팝업 선택기가 공통으로 쓰는 단일 소스
export function getPopupPeriod(popup: Pick<PopupEvent, 'start_date' | 'end_date'>, todayStr: string = kstToday()): PopupPeriod {
  const dayMs = 86400000;
  const start = new Date(popup.start_date + 'T00:00:00');
  const end = new Date(popup.end_date + 'T00:00:00');
  const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const status: PopupStatus = todayStr < popup.start_date ? '예정' : todayStr > popup.end_date ? '종료' : '진행중';
  const elapsedDays =
    status === '예정' ? 0 : Math.min(totalDays, Math.round((new Date(todayStr + 'T00:00:00').getTime() - start.getTime()) / dayMs) + 1);
  return { status, totalDays, elapsedDays, remainingDays: totalDays - elapsedDays };
}

export const POPUP_STATUS_BADGE_CLASS: Record<PopupStatus, string> = {
  진행중: 'bg-primary-700/10 text-primary-700 border-primary-700/30',
  종료: 'bg-[#f5f6f7] text-ink-muted border-hairline',
  예정: 'bg-sky-50 text-sky-600 border-sky-200',
};

// ── 달력 팝업 기간 배경 ──────────────────────────────────────────────
// 인사 탭 달력에서 팝업 운영 기간을 칸 배경의 옅은 띠로 깐다.
// 불투명한 막대를 날짜 줄 위에 얹으면 정작 근무 배정이 묻혀서, 배경으로 내리고 이름은 범례로 뺐다.

export interface CalendarPopup {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  /** 색상 순환 인덱스 — 팝업마다 고정돼 월을 넘겨도 같은 색을 유지한다 */
  colorIdx: number;
}

/** 그 날짜에 운영 중인 팝업만 (목록 순서 유지) */
export function popupsOnDate<T extends Pick<PopupEvent, 'start_date' | 'end_date'>>(popups: T[], dateStr: string): T[] {
  return popups.filter(p => dateStr >= p.start_date && dateStr <= p.end_date);
}

/**
 * 운영 중인 팝업 색을 가로 띠로 균등 분할해 칸 배경에 까는 CSS 그라데이션 — 운영 중인 팝업이 없으면 undefined.
 * 팝업 순서가 고정이라 여러 날에 걸쳐 같은 높이의 띠로 이어져 보이고, 겹치는 날만 띠가 위아래로 나뉜다.
 */
export function popupTintGradient(colors: string[]): string | undefined {
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return `linear-gradient(${colors[0]}, ${colors[0]})`;
  const step = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`);
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}
