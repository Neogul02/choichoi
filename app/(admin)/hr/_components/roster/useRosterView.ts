'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getWeekStart } from '@/lib/staffing';
import { parseDate, addDays, ymdToDateStr } from '@/lib/date';

/**
 * 근무표 뷰 상태 훅 — 월 커서·월/주 뷰 토글·표시 범위 필터·선택 날짜와
 * localStorage 동기화, 달력 그리드 파생값을 관리한다. 데이터 로딩은 useRosterRange 담당.
 */
export function useRosterView() {
  // 월 커서 — SSR/hydration 불일치를 피하려고 마운트 후 초기화
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [todayStr, setTodayStr] = useState('');
  // 월/주 뷰 토글 — 주 뷰는 weekStart(일요일)~+6일 범위를 로드해 인원별 매트릭스로 표시
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 날짜 범위 필터 (빈 문자열 = 제한 없음) — localStorage로 탭 전환 후에도 유지
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  // 첫 마운트/탭 복귀 시엔 localStorage 범위를 유지하고, 이후 cursor·unit 변경 시에만 초기화하기 위한 플래그
  const isFirstCursorEffect = useRef(true);

  useEffect(() => {
    const now = new Date();
    const ds = ymdToDateStr(now.getFullYear(), now.getMonth(), now.getDate());
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setTodayStr(ds);
    setWeekStart(getWeekStart(ds));
  }, []);

  // 마운트 시 localStorage에서 범위·뷰 모드 복원
  useEffect(() => {
    setRangeFrom(localStorage.getItem('roster_rangeFrom') ?? '');
    setRangeTo(localStorage.getItem('roster_rangeTo') ?? '');
    if (localStorage.getItem('roster_viewMode') === 'week') setViewMode('week');
  }, []);

  useEffect(() => {
    localStorage.setItem('roster_viewMode', viewMode);
  }, [viewMode]);

  // 현재 보고 있는 달 저장 (근무표 인쇄 모달 자동 날짜에 사용)
  useEffect(() => {
    if (cursor) localStorage.setItem('roster_cursor', JSON.stringify(cursor));
  }, [cursor]);

  // 범위 변경 시 localStorage 저장
  useEffect(() => {
    localStorage.setItem('roster_rangeFrom', rangeFrom);
    localStorage.setItem('roster_rangeTo', rangeTo);
  }, [rangeFrom, rangeTo]);

  /** 월/단위 변경 시 뷰 리셋 — 첫 호출(마운트·탭 복귀)은 localStorage 범위를 유지 */
  const resetOnCursorChange = () => {
    setSelectedDate(null);
    if (!isFirstCursorEffect.current) {
      setRangeFrom('');
      setRangeTo('');
    }
    isFirstCursorEffect.current = false;
  };

  const monthStart = cursor ? ymdToDateStr(cursor.y, cursor.m, 1) : '';
  const monthEnd = cursor ? ymdToDateStr(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) : '';
  const weekEndStr = weekStart ? addDays(weekStart, 6) : '';
  // 현재 뷰가 로드하는 데이터 범위 — 주 뷰는 월 경계를 넘을 수 있어 월 범위와 별개
  const loadFrom = viewMode === 'week' && weekStart ? weekStart : monthStart;
  const loadTo = viewMode === 'week' && weekStart ? weekEndStr : monthEnd;

  // 달력 그리드 — range 모드(from+to 모두 설정)면 해당 날짜만, 아니면 월 전체
  const gridDates = useMemo(() => {
    if (!cursor) return [];

    if (rangeFrom && rangeTo && rangeFrom <= rangeTo) {
      // range 뷰: rangeFrom~rangeTo 포함 주(일~토) 그리드
      const fromDate = parseDate(rangeFrom);
      const toDate = parseDate(rangeTo);
      const weekStartDate = new Date(fromDate);
      weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay());
      const weekEnd = new Date(toDate);
      weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
      const cells: (string | null)[] = [];
      const cur = new Date(weekStartDate);
      while (cur <= weekEnd) {
        const ds = ymdToDateStr(cur.getFullYear(), cur.getMonth(), cur.getDate());
        cells.push(ds >= rangeFrom && ds <= rangeTo ? ds : null);
        cur.setDate(cur.getDate() + 1);
      }
      return cells;
    }

    // 월 전체 그리드
    const firstDay = new Date(cursor.y, cursor.m, 1).getDay();
    const lastDate = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= lastDate; d++) cells.push(ymdToDateStr(cursor.y, cursor.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor, rangeFrom, rangeTo]);

  // 화면에 보이는 날짜들 — 주 뷰는 해당 주 7일, 월 뷰는 달력 그리드
  const visibleDates = useMemo(
    () => viewMode === 'week' && weekStart
      ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      : gridDates,
    [viewMode, weekStart, gridDates],
  );

  // 현재 화면이 작업 대상으로 삼는 기간 — 주 뷰는 표시 중인 주, 월 뷰는 범위 필터 또는 월 전체
  const targetFrom = viewMode === 'week' && weekStart ? weekStart : (rangeFrom || monthStart);
  const targetTo = viewMode === 'week' && weekStart ? weekEndStr : (rangeTo || monthEnd);
  const targetLabel = viewMode === 'week' && weekStart
    ? `${weekStart} ~ ${weekEndStr}`
    : (rangeFrom || rangeTo) ? `${rangeFrom || monthStart} ~ ${rangeTo || monthEnd}` : cursor ? `${cursor.m + 1}월 전체` : '';

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

  const switchView = (mode: 'month' | 'week') => {
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
    viewMode, weekStart, setWeekStart,
    selectedDate, setSelectedDate,
    rangeFrom, setRangeFrom, rangeTo, setRangeTo,
    resetOnCursorChange,
    monthStart, monthEnd, weekEndStr, loadFrom, loadTo,
    gridDates, visibleDates,
    targetFrom, targetTo, targetLabel,
    syncCursorToDate, moveWeek, switchView,
  };
}
