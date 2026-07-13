'use client';

import { useEffect, useRef, useState } from 'react';
import { showMsg } from '@/lib/toast';
import {
  fetchRosterRange, addRosterAssignment, removeRosterAssignment,
  updateRosterAssignmentTime, setShiftRequirement, clearShiftRequirement,
} from '@/app/actions/roster';
import type { RosterUnit, RosterMonthData } from '@/app/actions/roster';
import type { RosterShift, RosterAssignment } from '@/types/database';

interface Options {
  unit: RosterUnit;
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
  unit, cursor, viewMode, weekStart, loadFrom, loadTo, initialData, refreshSignal, onCursorChange,
}: Options) {
  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // `${date}|${shiftId}` → required
  const [isLoading, setIsLoading] = useState(true);
  // 서버 프리페치 데이터는 최초 1회만 판정·소비 — 월 이동 후 복귀 시 낡은 데이터 재사용 방지
  const initialDataConsumed = useRef(!initialData);

  const loadRange = async () => {
    if (!cursor) return;
    // 캐셔는 storeId가 null이면 stores 미로드 상태 — 로드 건너뜀
    if (unit.staffRole === 'cashier' && unit.storeId === null) return;
    const r = await fetchRosterRange(unit, loadFrom, loadTo);
    if (r.success && r.data) {
      setShifts(r.data.shifts);
      setAssignments(r.data.assignments);
      setOverrides(Object.fromEntries(r.data.requirements.map(q => [`${q.work_date}|${q.shift_id}`, q.required])));
    }
  };

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
        unit.staffRole === initialData.unit.staffRole && unit.storeId === initialData.unit.storeId
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

  const handleAdd = async (dateStr: string, shiftId: number, staffId: number) => {
    const r = await addRosterAssignment(unit, dateStr, shiftId, staffId);
    if (r.success && r.data) setAssignments(p => [...p, r.data!]);
    else showMsg(`오류: ${r.error}`);
  };

  const handleRemove = async (id: number) => {
    const r = await removeRosterAssignment(id);
    if (r.success) setAssignments(p => p.filter(a => a.id !== id));
    else showMsg(`오류: ${r.error}`);
  };

  const handleTimeChange = async (id: number, start: string | null, end: string | null) => {
    const r = await updateRosterAssignmentTime(id, start, end);
    if (r.success && r.data) setAssignments(p => p.map(a => a.id === id ? r.data! : a));
    else showMsg(`오류: ${r.error}`);
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
    isLoading,
    loadRange,
    handleAdd, handleRemove, handleTimeChange, handleRequirementChange, handleRequirementReset,
  };
}
