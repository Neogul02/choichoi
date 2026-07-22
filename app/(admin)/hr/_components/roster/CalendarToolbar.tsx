'use client';

import type { Dispatch, SetStateAction } from 'react';
import { getWeekStart } from '@/lib/staffing';

interface Props {
  viewMode: 'month' | 'week';
  cursor: { y: number; m: number };
  weekStart: string | null;
  weekEndStr: string;
  todayStr: string;
  isLoading: boolean;
  isAutoFilling: boolean;
  setCursor: Dispatch<SetStateAction<{ y: number; m: number } | null>>;
  setWeekStart: Dispatch<SetStateAction<string | null>>;
  moveWeek: (delta: number) => void;
  switchView: (mode: 'month' | 'week') => void;
  syncCursorToDate: (ds: string) => void;
  onCopyPrevWeek: () => void;
  onCopyWeekText: () => void;
  onAutoFill: () => void;
  onClearRoster: () => void;
  onShowBulkEdit: () => void;
  onShowShiftManage: () => void;
}

/** 달력 헤더 툴바 — 월/주 이동, 뷰 토글, 지난주 복사·자동 채우기 등 액션 버튼 */
export default function CalendarToolbar({
  viewMode, cursor, weekStart, weekEndStr, todayStr, isLoading, isAutoFilling,
  setCursor, setWeekStart, moveWeek, switchView, syncCursorToDate,
  onCopyPrevWeek, onCopyWeekText, onAutoFill, onClearRoster, onShowBulkEdit, onShowShiftManage,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-2">
        <button
          aria-label={viewMode === 'week' ? '이전 주' : '이전 달'}
          className="w-11 h-11 md:w-7 md:h-7 rounded-lg bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm"
          onClick={() => viewMode === 'week'
            ? moveWeek(-7)
            : setCursor(c => c && (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
        >
          &lt;
        </button>
        <h3 className="m-0 text-base font-extrabold w-[110px] text-center">
          {viewMode === 'week' && weekStart
            ? `${Number(weekStart.slice(5, 7))}/${Number(weekStart.slice(8))} ~ ${Number(weekEndStr.slice(5, 7))}/${Number(weekEndStr.slice(8))}`
            : `${cursor.y}년 ${cursor.m + 1}월`}
        </h3>
        <button
          aria-label={viewMode === 'week' ? '다음 주' : '다음 달'}
          className="w-11 h-11 md:w-7 md:h-7 rounded-lg bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm"
          onClick={() => viewMode === 'week'
            ? moveWeek(7)
            : setCursor(c => c && (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
        >
          &gt;
        </button>
        {viewMode === 'week' && (
          <button
            onClick={() => { if (todayStr) { setWeekStart(getWeekStart(todayStr)); syncCursorToDate(todayStr); } }}
            className="px-2.5 py-2 md:px-2 md:py-1 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
          >
            이번 주
          </button>
        )}
        <div className="flex rounded-lg border border-hairline overflow-hidden ml-1">
          <button
            onClick={() => switchView('month')}
            aria-pressed={viewMode === 'month'}
            className={`px-3 py-2 md:px-2.5 md:py-1 text-[11px] font-bold cursor-pointer border-none transition ${
              viewMode === 'month' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
            }`}
          >
            월
          </button>
          <button
            onClick={() => switchView('week')}
            aria-pressed={viewMode === 'week'}
            className={`px-3 py-2 md:px-2.5 md:py-1 text-[11px] font-bold cursor-pointer border-none transition ${
              viewMode === 'week' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
            }`}
          >
            주
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viewMode === 'week' && (
          <>
            <button
              onClick={onCopyPrevWeek}
              disabled={isLoading}
              className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-[11px] font-bold cursor-pointer hover:bg-primary-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              지난주 복사
            </button>
            <button
              onClick={onCopyWeekText}
              disabled={isLoading}
              title="이번 주 근무 안내 텍스트 복사"
              className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              주간 복사
            </button>
          </>
        )}
        <button
          onClick={onAutoFill}
          disabled={isAutoFilling || isLoading}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg border-none bg-primary-700 text-white text-[11px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isAutoFilling ? '배정 중...' : '자동 채우기'}
        </button>
        <button
          onClick={onClearRoster}
          disabled={isLoading}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-[11px] font-bold cursor-pointer hover:bg-rose-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          초기화
        </button>
        <button
          onClick={onShowBulkEdit}
          disabled={isLoading}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          일괄 편집
        </button>
        <button
          onClick={onShowShiftManage}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
        >
          ⚙ 파트 관리
        </button>
      </div>
    </div>
  );
}
