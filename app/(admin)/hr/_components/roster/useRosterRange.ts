'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { showMsg } from '@/lib/toast';
import { resolveBreakMinutes } from '@/lib/workhours';
import {
  fetchRosterRange, addRosterAssignment, removeRosterAssignment,
  updateRosterAssignmentTime, updateRosterAssignmentBreak, setShiftRequirement, clearShiftRequirement,
} from '@/app/actions/roster';
import type { RosterUnit, RosterMonthData } from '@/app/actions/roster';
import { fetchPopupClosedDays, addPopupClosedDays, removePopupClosedDay } from '@/app/actions/schedule';
import { buildClosedDayIndex, isClosedDay, type ClosedDayIndex } from '@/lib/closedDays';
import type { RosterShift, RosterAssignment, StaffProfile } from '@/types/database';

interface Options {
  unit: RosterUnit;
  /** 낙관적 추가 시 이름 표시용 — 전체 직원 목록 */
  staffList: StaffProfile[];
  cursor: { y: number; m: number } | null;
  viewMode: 'month' | 'week';
  weekStart: string | null;
  loadFrom: string;
  loadTo: string;
  /** 서버(page.tsx)가 프리페치한 당월 데이터 — 첫 로드 시 단위·월이 일치하면 왕복 없이 사용 */
  initialData?: { unit: RosterUnit; y: number; m: number; data: RosterMonthData };
  /** 외부 배정(StaffAssignModal) 후 재로드 트리거 */
  refreshSignal?: number;
  /** cursor·unit·뷰 변경으로 재로드될 때 뷰 리셋(선택 날짜·범위 필터) 콜백 */
  onCursorChange: () => void;
}

/**
 * 근무표 데이터 훅 — 파트/배정/요구 인원 로딩과 단건 변경(추가·삭제·시간·요구 인원)을 관리한다.
 * 뷰 상태(cursor·viewMode·범위)는 useRosterView가 소유하고 여기서는 값만 받는다.
 */
export function useRosterRange({
  unit, staffList, cursor, viewMode, weekStart, loadFrom, loadTo, initialData, refreshSignal, onCursorChange,
}: Options) {
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // `${date}|${shiftId}` → required
  // 팝업 휴무일 — 보는 기간의 모든 팝업을 한 번에 담는다. 캐셔 "전체" 보기는 여러 팝업의 파트가
  // 섞여 있어 파트의 popup_id로 판정해야 하므로 팝업별로 걸러 받지 않는다.
  const [closedDays, setClosedDays] = useState<ClosedDayIndex>(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  // 서버 프리페치 데이터는 최초 1회만 판정·소비 — 월 이동 후 복귀 시 낡은 데이터 재사용 방지
  const initialDataConsumed = useRef(!initialData);
  // 낙관적 추가 행의 임시 id — 서버 id와 충돌하지 않게 음수 사용
  const tempIdRef = useRef(-1);
  const queryClient = useQueryClient();
  // 근무 추가/삭제/시간/휴게 변경은 급여 계산에 영향을 주므로, 급여정산 화면(react-query 캐시)이
  // 오래된 값을 들고 있지 않도록 무효화한다 — 캐시가 살아있는 5분 안에 두 화면을 오가면 값이 어긋남
  const invalidatePayroll = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['payroll'] }),
    [queryClient],
  );

  const loadRange = async () => {
    if (!cursor) return;
    // 캐셔는 popupId가 null이면 팝업 미로드 상태 — 로드 건너뜀
    if (unit.staffRole === 'cashier' && unit.popupId === null) return;
    const r = await fetchRosterRange(unit, loadFrom, loadTo);
    if (r.success && r.data) {
      setShifts(r.data.shifts);
      setAssignments(r.data.assignments);
      setOverrides(Object.fromEntries(r.data.requirements.map(q => [`${q.work_date}|${q.shift_id}`, q.required])));
    }
  };

  // 휴무일은 배정과 독립이라(프리페치 대상도 아니다) 보는 기간이 바뀔 때만 따로 불러온다 —
  // 서버 프리페치로 배정 조회를 건너뛰는 첫 로드에서도 빠지지 않게 한다
  const loadClosedDays = useCallback(async () => {
    const r = await fetchPopupClosedDays(undefined, loadFrom, loadTo);
    if (r.success && r.data) setClosedDays(buildClosedDayIndex(r.data));
    else if (!r.success) showMsg(`휴무일을 불러오지 못했습니다: ${r.error}`);
  }, [loadFrom, loadTo]);

  useEffect(() => { void loadClosedDays(); }, [loadClosedDays]);

  // 외부 배정(StaffAssignModal) 후 캘린더 데이터 재로드
  useEffect(() => {
    if (!refreshSignal) return;
    loadRange();
    // loadRange를 deps에 넣으면 함수 참조 변경마다 재실행 — refreshSignal 변화에만 반응하는 것이 목적
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    if (!cursor) return;
    setIsLoading(true);
    onCursorChange();
    if (!initialDataConsumed.current) {
      initialDataConsumed.current = true;
      if (
        viewMode === 'month' &&
        initialData &&
        cursor.y === initialData.y && cursor.m === initialData.m &&
        unit.staffRole === initialData.unit.staffRole && unit.popupId === initialData.unit.popupId
      ) {
        setShifts(initialData.data.shifts);
        setAssignments(initialData.data.assignments);
        setOverrides(Object.fromEntries(initialData.data.requirements.map(q => [`${q.work_date}|${q.shift_id}`, q.required])));
        setIsLoading(false);
        return;
      }
    }
    loadRange().then(() => setIsLoading(false));
    // loadRange·onCursorChange는 최신 뷰 상태를 클로저로 캡처 — deps는 재로드 트리거(cursor·unit·뷰)만 등록
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, unit, viewMode, weekStart]);

  // 낙관적 추가 — 임시 음수 id로 즉시 표시 후 서버 행으로 치환, 실패(중복 배정 등) 시 제거
  // useCallback로 안정화 — MonthGrid에 이 함수(경유 핸들러)를 props로 내려 memo 경계를 두기 위함
  const handleAdd = useCallback(async (dateStr: string, shiftId: number, staffId: number) => {
    const staff = staffList.find(s => s.id === staffId);
    // 서버도 파트 시간을 확정값으로 복사해 저장하므로(addRosterAssignment) 낙관적 행도 같은 값을 보여준다 —
    // null로 두면 저장 직후 "기본시간"이 잠깐 보였다가 실제 시간으로 바뀌어 깜빡였다.
    const shift = shifts.find(s => s.id === shiftId);
    const tempId = tempIdRef.current--;
    const optimistic: RosterAssignment = {
      id: tempId,
      work_date: dateStr,
      shift_id: shiftId,
      staff_id: staffId,
      staff_role: unit.staffRole,
      popup_id: unit.popupId,
      start_time: shift?.start_time ?? null,
      end_time: shift?.end_time ?? null,
      break_minutes: shift ? resolveBreakMinutes(null, shift.break_minutes) : null,
      created_at: new Date().toISOString(),
      staff_profiles: staff ? { id: staff.id, name: staff.name, phone: staff.phone, status: staff.status } : undefined,
    };
    setAssignments(p => [...p, optimistic]);
    const r = await addRosterAssignment(unit, dateStr, shiftId, staffId);
    if (r.success && r.data) {
      setAssignments(p => p.map(a => a.id === tempId ? r.data! : a));
      invalidatePayroll();
    } else {
      setAssignments(p => p.filter(a => a.id !== tempId));
      showMsg(`오류: ${r.error}`);
    }
  }, [staffList, shifts, unit, invalidatePayroll]);

  // 낙관적 삭제 — 즉시 제거 후 실패 시 원복
  const handleRemove = async (id: number) => {
    const removed = assignments.find(a => a.id === id);
    setAssignments(p => p.filter(a => a.id !== id));
    const r = await removeRosterAssignment(id);
    if (r.success) {
      invalidatePayroll();
    } else {
      if (removed) setAssignments(p => [...p, removed]);
      showMsg(`오류: ${r.error}`);
    }
  };

  // 낙관적 시간 수정 — 즉시 반영 후 서버 행으로 확정, 실패 시 원복
  const handleTimeChange = async (id: number, start: string | null, end: string | null) => {
    const prev = assignments.find(a => a.id === id);
    setAssignments(p => p.map(a => a.id === id ? { ...a, start_time: start, end_time: end } : a));
    const r = await updateRosterAssignmentTime(id, start, end);
    if (r.success && r.data) {
      setAssignments(p => p.map(a => a.id === id ? r.data! : a));
      invalidatePayroll();
    } else {
      if (prev) setAssignments(p => p.map(a => a.id === id ? prev : a));
      showMsg(`오류: ${r.error}`);
    }
  };

  // 낙관적 휴게시간 오버라이드 — null(기본 1시간)과 특정 값(예: 0=미포함) 사이 토글, 실패 시 원복
  const handleBreakChange = async (id: number, breakMinutes: number | null) => {
    const prev = assignments.find(a => a.id === id);
    setAssignments(p => p.map(a => a.id === id ? { ...a, break_minutes: breakMinutes } : a));
    const r = await updateRosterAssignmentBreak(id, breakMinutes);
    if (r.success && r.data) {
      setAssignments(p => p.map(a => a.id === id ? r.data! : a));
      invalidatePayroll();
    } else {
      if (prev) setAssignments(p => p.map(a => a.id === id ? prev : a));
      showMsg(`오류: ${r.error}`);
    }
  };

  /**
   * 휴무일 토글 — 그 팝업의 그 날이 휴무인지 뒤집는다.
   * 이미 찍힌 배정은 건드리지 않는다 — 급여는 배정 행이 기준이라 자동으로 지우면 유급 시간이
   * 조용히 줄어든다. 남은 배정 건수는 DayPanel이 보여주고, 삭제는 거기서 따로 확인받는다.
   */
  const handleToggleClosedDay = async (dateStr: string, popupId: number) => {
    const wasClosed = isClosedDay(closedDays, popupId, dateStr);
    const r = wasClosed
      ? await removePopupClosedDay(popupId, dateStr)
      : await addPopupClosedDays(popupId, [dateStr], null);
    if (!r.success) { showMsg(`오류: ${r.error}`); return; }
    setClosedDays(prev => {
      const next = new Map(prev);
      if (wasClosed) next.delete(`${popupId}|${dateStr}`);
      else next.set(`${popupId}|${dateStr}`, null);
      return next;
    });
    showMsg(wasClosed ? '휴무일이 해제됐습니다' : '휴무일로 지정됐습니다');
  };

  const handleRequirementChange = async (dateStr: string, shiftId: number, required: number) => {
    const r = await setShiftRequirement(dateStr, shiftId, required);
    if (r.success && r.data) setOverrides(p => ({ ...p, [`${dateStr}|${shiftId}`]: r.data!.required }));
    else showMsg(`오류: ${r.error}`);
  };

  const handleRequirementReset = async (dateStr: string, shiftId: number) => {
    const r = await clearShiftRequirement(dateStr, shiftId);
    if (r.success) setOverrides(p => { const n = { ...p }; delete n[`${dateStr}|${shiftId}`]; return n; });
    else showMsg(`오류: ${r.error}`);
  };

  return {
    shifts, setShifts,
    assignments, setAssignments,
    overrides,
    closedDays,
    isLoading,
    loadRange,
    loadClosedDays,
    handleAdd, handleRemove, handleTimeChange, handleBreakChange, handleRequirementChange, handleRequirementReset,
    handleToggleClosedDay,
  };
}
