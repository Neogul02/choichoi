'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';
import { DAY_NAMES } from '@/lib/staffing';

const PopupDayPanel = dynamic(() => import('./PopupDayPanel'), {
  ssr: false,
  loading: () => <div className="h-60 rounded-lg bg-canvas-soft animate-pulse" />,
});

const label = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${DAY_NAMES[new Date(`${d}T00:00:00`).getDay()]})`;

/**
 * 팝업 분석 '일별 매출 추이' 막대를 누르면 뜨는 하루 상세 — 그 팝업의 그날 시간대별 매출·메뉴·매출/주문(수정 가능).
 * ‹ › 로 매출이 있는 앞뒤 날을 넘겨 본다(예: 지난 팝업 목요일들의 몰리는 시간 비교).
 * 내용은 달력 하루 상세 창의 팝업 탭(PopupDayPanel)과 같다.
 */
export default function PopupDaySheet({ popupId, popupName, dates, date, onDateChange, onClose, onChanged }: {
  popupId: number;
  popupName: string;
  /** 넘겨 볼 수 있는 날짜(매출이 있는 날, 오름차순) */
  dates: string[];
  date: string;
  onDateChange: (d: string) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  useBodyScrollLock();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: true, onClose, containerRef: panelRef });
  const idx = dates.indexOf(date);
  const prev = idx > 0 ? dates[idx - 1] : null;
  const next = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  // ←/→ 키로도 넘긴다(입력칸에 포커스가 있으면 커서 이동이 우선)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' && prev) onDateChange(prev);
      if (e.key === 'ArrowRight' && next) onDateChange(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onDateChange]);

  const navBtn = 'w-9 h-9 flex items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-muted text-lg font-bold cursor-pointer hover:bg-canvas-soft disabled:opacity-30 disabled:cursor-default';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${popupName} ${label(date)} 하루 상세`}
        className="bg-canvas w-full sm:max-w-[520px] rounded-t-2xl sm:rounded-xl shadow-level-2 border border-hairline overflow-hidden max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline shrink-0">
          <button type="button" onClick={() => prev && onDateChange(prev)} disabled={!prev} aria-label="이전 날" className={navBtn}>‹</button>
          <div className="min-w-0 flex-1 text-center">
            <p className="m-0 text-[11px] text-ink-faint font-medium truncate">{popupName} · 하루 상세</p>
            <h3 className="m-0 text-[16px] font-bold text-ink">{label(date)}</h3>
          </div>
          <button type="button" onClick={() => next && onDateChange(next)} disabled={!next} aria-label="다음 날" className={navBtn}>›</button>
          <button type="button" onClick={onClose} aria-label="닫기" className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg border-none bg-transparent text-ink-faint cursor-pointer hover:bg-canvas-soft">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-4">
          <PopupDayPanel key={date} popupId={popupId} date={date} onChanged={onChanged} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
