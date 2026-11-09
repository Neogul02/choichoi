'use client';

import type { Dispatch, SetStateAction } from 'react';
import { getWeekStart } from '@/lib/staffing';
import type { RosterViewMode } from './useRosterView';

/** 기간 뷰에서 고를 수 있는 팝업 */
export interface PeriodOption { id: number; name: string; start_date: string; end_date: string }

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

interface Props {
  viewMode: RosterViewMode;
  /** 기간 뷰가 실제로 켜져 있는지 (고를 팝업이 없으면 viewMode가 period여도 월 뷰로 동작) */
  isPeriod: boolean;
  /** 기간 뷰에서 보여 줄 팝업 — 캐셔 개별 보기는 그 팝업 하나로 고정, 그 외에는 목록에서 고른다 */
  periodOptions: PeriodOption[];
  periodPopup: PeriodOption | null;
  /** 캐셔 개별 보기처럼 팝업이 이미 정해져 있으면 고르는 칸 대신 이름만 보여준다 */
  periodLocked: boolean;
  onPeriodPopupChange: (popupId: number) => void;
  cursor: { y: number; m: number };
  weekStart: string | null;
  weekEndStr: string;
  todayStr: string;
  isLoading: boolean;
  /** 캐셔 "전체" 보기 — 특정 팝업에 귀속되는 일괄/파트 편집 액션은 비활성화(단건 배정 추가/삭제는 계속 가능) */
  disableUnitActions?: boolean;
  setCursor: Dispatch<SetStateAction<{ y: number; m: number } | null>>;
  setWeekStart: Dispatch<SetStateAction<string | null>>;
  moveWeek: (delta: number) => void;
  switchView: (mode: RosterViewMode) => void;
  syncCursorToDate: (ds: string) => void;
  onCopyPrevWeek: () => void;
  onCopyWeekText: () => void;
  onClearRoster: () => void;
  onShowBulkEdit: () => void;
  onShowShiftManage: () => void;
}

/** 달력 헤더 툴바 — 월/주 이동, 뷰 토글, 지난주 복사·자동 채우기 등 액션 버튼 */
export default function CalendarToolbar({
  viewMode, isPeriod, periodOptions, periodPopup, periodLocked, onPeriodPopupChange, cursor, weekStart, weekEndStr, todayStr, isLoading, disableUnitActions,
  setCursor, setWeekStart, moveWeek, switchView, syncCursorToDate,
  onCopyPrevWeek, onCopyWeekText, onClearRoster, onShowBulkEdit, onShowShiftManage,
}: Props) {
  const unitActionTitle = disableUnitActions ? '전체 보기에서는 사용할 수 없습니다 — 팝업을 선택하세요' : undefined;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div className="flex flex-wrap items-center gap-2">
        {isPeriod && periodPopup ? (
          periodLocked || periodOptions.length <= 1 ? (
            <h3 className="m-0 text-base font-extrabold whitespace-nowrap">
              {periodPopup.name} <span className="text-ink-muted tabular-nums">{md(periodPopup.start_date)}~{md(periodPopup.end_date)}</span>
            </h3>
          ) : (
            <select
              value={periodPopup.id}
              onChange={e => onPeriodPopupChange(Number(e.target.value))}
              aria-label="기간을 볼 팝업"
              className="h-11 md:h-8 px-2 rounded-lg border border-hairline bg-canvas text-sm font-extrabold text-ink cursor-pointer"
            >
              {periodOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({md(p.start_date)}~{md(p.end_date)})</option>
              ))}
            </select>
          )
        ) : (
          <>
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
                ? `${md(weekStart)} ~ ${md(weekEndStr)}`
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
          </>
        )}
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
            aria-pressed={viewMode === 'month' || (viewMode === 'period' && !isPeriod)}
            className={`px-3 py-2 md:px-2.5 md:py-1 text-[11px] font-bold cursor-pointer border-none transition ${
              viewMode === 'month' || (viewMode === 'period' && !isPeriod) ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
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
          <button
            onClick={() => switchView('period')}
            aria-pressed={isPeriod}
            disabled={periodOptions.length === 0}
            title={periodOptions.length === 0 ? '진행 중이거나 예정된 팝업이 없습니다' : '팝업 운영 기간 전체를 한 달력에 이어서 봅니다 (달이 바뀌어도 넘기지 않아도 됨)'}
            className={`px-3 py-2 md:px-2.5 md:py-1 text-[11px] font-bold cursor-pointer border-none transition disabled:opacity-50 disabled:cursor-not-allowed ${
              isPeriod ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
            }`}
          >
            팝업 기간
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viewMode === 'week' && (
          <>
            <button
              onClick={onCopyPrevWeek}
              disabled={isLoading || disableUnitActions}
              title={unitActionTitle}
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
          onClick={onClearRoster}
          disabled={isLoading || disableUnitActions}
          title={unitActionTitle}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-[11px] font-bold cursor-pointer hover:bg-rose-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          초기화
        </button>
        <button
          onClick={onShowBulkEdit}
          disabled={isLoading || disableUnitActions}
          title={unitActionTitle}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          일괄 편집
        </button>
        <button
          onClick={onShowShiftManage}
          disabled={disableUnitActions}
          title={unitActionTitle}
          className="px-3 py-2 md:px-2.5 md:py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ⚙ 파트 관리
        </button>
      </div>
    </div>
  );
}
