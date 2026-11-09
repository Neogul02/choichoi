'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWeekStart } from '@/lib/staffing';
import { parseDate, addDays, ymdToDateStr } from '@/lib/date';

// WeeklyRosterPrintModal.tsx도 초기 인쇄 범위를 정할 때 같은 키를 읽으므로 공유 상수로 노출한다
export const ROSTER_CURSOR_KEY = 'roster_cursor';

/** 월 / 주 / 팝업 기간 — 기간 뷰는 달을 넘는 팝업(예: 11/13~12/3)을 한 화면에 이어서 보여준다 */
export type RosterViewMode = 'month' | 'week' | 'period';

/**
 * 근무표 뷰 상태 훅 — 월 커서·월/주 뷰 토글·선택 날짜의 localStorage 동기화와
 * 달력 그리드 파생값을 관리한다. 데이터 로딩은 useRosterRange 담당.
 */
export function useRosterView(period: { from: string; to: string } | null = null) {
  // 월 커서 — SSR/hydration 불일치를 피하려고 마운트 후 초기화
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [todayStr, setTodayStr] = useState('');
  // 월/주 뷰 토글 — 주 뷰는 weekStart(일요일)~+6일 범위를 로드해 인원별 매트릭스로 표시
  const [viewMode, setViewMode] = useState<RosterViewMode>('month');
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const ds = ymdToDateStr(now.getFullYear(), now.getMonth(), now.getDate());
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setTodayStr(ds);
    setWeekStart(getWeekStart(ds));
  }, []);

  // 마운트 시 localStorage에서 뷰 모드 복원
  useEffect(() => {
    const saved = localStorage.getItem('roster_viewMode');
    if (saved === 'week' || saved === 'period') setViewMode(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem('roster_viewMode', viewMode);
  }, [viewMode]);

  // 현재 보고 있는 달 저장 (근무표 인쇄 모달 자동 날짜에 사용)
  useEffect(() => {
    if (cursor) localStorage.setItem(ROSTER_CURSOR_KEY, JSON.stringify(cursor));
  }, [cursor]);

  /** 월/단위 변경 시 뷰 리셋 */
  const resetOnCursorChange = () => {
    setSelectedDate(null);
  };

  const monthStart = cursor ? ymdToDateStr(cursor.y, cursor.m, 1) : '';
  const monthEnd = cursor ? ymdToDateStr(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) : '';
  const weekEndStr = weekStart ? addDays(weekStart, 6) : '';
  // 기간 뷰인데 고를 팝업이 없으면(팝업 0개) 월 뷰처럼 동작한다
  const isPeriod = viewMode === 'period' && period != null;
  const periodFrom = period?.from ?? '';
  const periodTo = period?.to ?? '';
  // 현재 뷰가 로드하는 데이터 범위 — 주·기간 뷰는 월 경계를 넘을 수 있어 월 범위와 별개
  const loadFrom = isPeriod ? periodFrom : viewMode === 'week' && weekStart ? weekStart : monthStart;
  const loadTo = isPeriod ? periodTo : viewMode === 'week' && weekStart ? weekEndStr : monthEnd;

  // 달력 그리드 — 월 뷰는 그 달 전체, 기간 뷰는 팝업 기간이 걸친 주들을 이어 붙이고 기간 밖은 빈 칸
  const gridDates = useMemo(() => {
    if (isPeriod) {
      const cells: (string | null)[] = [];
      for (let d = getWeekStart(periodFrom); d <= periodTo || cells.length % 7 !== 0; d = addDays(d, 1)) {
        cells.push(d >= periodFrom && d <= periodTo ? d : null);
      }
      return cells;
    }
    if (!cursor) return [];
    const firstDay = new Date(cursor.y, cursor.m, 1).getDay();
    const lastDate = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= lastDate; d++) cells.push(ymdToDateStr(cursor.y, cursor.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor, isPeriod, periodFrom, periodTo]);

  // 화면에 보이는 날짜들 — 주 뷰는 해당 주 7일, 월 뷰는 달력 그리드
  const visibleDates = useMemo(
    () => viewMode === 'week' && weekStart
      ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      : gridDates,
    [viewMode, weekStart, gridDates],
  );

  // 현재 화면이 작업 대상으로 삼는 기간 — 주 뷰는 표시 중인 주, 기간 뷰는 팝업 기간, 월 뷰는 월 전체
  const targetFrom = loadFrom;
  const targetTo = loadTo;
  const targetLabel = isPeriod
    ? `${periodFrom} ~ ${periodTo}`
    : viewMode === 'week' && weekStart
      ? `${weekStart} ~ ${weekEndStr}`
      : cursor ? `${cursor.m + 1}월 전체` : '';

  const syncCursorToDate = (ds: string) => {
    const d = parseDate(ds);
    setCursor(c => c && c.y === d.getFullYear() && c.m === d.getMonth() ? c : { y: d.getFullYear(), m: d.getMonth() });
  };

  const moveWeek = (delta: number) => {
    if (!weekStart) return;
    const next = addDays(weekStart, delta);
    setWeekStart(next);
    syncCursorToDate(next);
  };

  const switchView = (mode: RosterViewMode) => {
    if (mode === viewMode) return;
    if (mode === 'week') {
      // 선택된 날짜 > 오늘(이번 달일 때) > 월초 순으로 기준 주 결정
      const base = selectedDate ?? ((todayStr >= monthStart && todayStr <= monthEnd) ? todayStr : monthStart);
      setWeekStart(getWeekStart(base));
    }
    setViewMode(mode);
  };

  return {
    cursor, setCursor, todayStr,
    viewMode, isPeriod, weekStart, setWeekStart,
    selectedDate, setSelectedDate,
    resetOnCursorChange,
    monthStart, monthEnd, weekEndStr, loadFrom, loadTo,
    gridDates, visibleDates,
    targetFrom, targetTo, targetLabel,
    syncCursorToDate, moveWeek, switchView,
  };
}
