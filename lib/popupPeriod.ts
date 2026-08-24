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
