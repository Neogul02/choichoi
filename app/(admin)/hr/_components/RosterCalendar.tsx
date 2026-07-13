'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { showMsg } from '@/lib/toast';
import {
  fetchRosterRange, addRosterAssignment, removeRosterAssignment,
  updateRosterAssignmentTime, setShiftRequirement, clearShiftRequirement, autoFillRoster, clearRosterRange,
  copyPreviousWeek, undoRosterChange,
} from '@/app/actions/roster';
import type { RosterUnit, RosterMonthData, AutoFillLogEntry, RosterUndoPayload } from '@/app/actions/roster';
import type { StaffProfile, Store, StaffRole, RosterShift, RosterAssignment } from '@/types/database';
import { DAY_NAMES, STATUS_LABELS, ROLE_LABELS, checkStaffAvailability, shiftTextColor } from './constants';
import { getWeekStart, findRosterViolations, toMinutes, MIN_REST_MINUTES, requiredFor, buildAssignMap } from '@/lib/staffing';
import { parseDate, addDays, prevDate, dayOfWeek, ymdToDateStr } from '@/lib/date';
import { CalendarGridSkeleton, MatrixSkeleton } from '@/components/Skeleton';
import ShiftManageModal from './ShiftManageModal';
import BulkEditModal from './BulkEditModal';
import WeekMatrix from './WeekMatrix';
import AutoFillLogPanel from './AutoFillLogPanel';
import ShortagesPanel from './ShortagesPanel';
import StaffTotalsPanel from './StaffTotalsPanel';

interface Props {
  staffList: StaffProfile[];
  stores: Store[];
  roleFilter: StaffRole;
  refreshSignal?: number;
  /** 서버(page.tsx)가 프리페치한 당월 데이터 — 첫 로드 시 단위·월이 일치하면 왕복 없이 사용 */
  initialData?: { unit: RosterUnit; y: number; m: number; data: RosterMonthData };
}

export default function RosterCalendar({ staffList, stores, roleFilter, refreshSignal, initialData }: Props) {
  // 단위 = 주방 전체 또는 캐셔의 특정 매장
  const [unit, setUnit] = useState<RosterUnit>({ staffRole: 'kitchen', storeId: null });

  // 좌측 roleFilter 변경 시 캘린더 단위 동기화
  // stores를 deps에 포함 — 스토어가 로드되기 전에 storeId=null로 초기화되면 잘못된 시프트 set이 생성됨
  useEffect(() => {
    if (roleFilter === 'kitchen') {
      setUnit({ staffRole: 'kitchen', storeId: null });
      return;
    }
    // 캐셔는 stores가 로드된 후에만 초기화
    if (stores.length === 0) return;
    setUnit(prev => {
      // 이미 올바른 매장이 선택된 경우 유지
      if (prev.staffRole === 'cashier' && prev.storeId !== null) return prev;
      return { staffRole: 'cashier', storeId: stores[0].id };
    });
  }, [roleFilter, stores]);
  // 월 커서 — SSR/hydration 불일치를 피하려고 마운트 후 초기화
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [todayStr, setTodayStr] = useState('');
  // 월/주 뷰 토글 — 주 뷰는 weekStart(일요일)~+6일 범위를 로드해 인원별 매트릭스로 표시
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState<string | null>(null);
  useEffect(() => {
    const now = new Date();
    const ds = ymdToDateStr(now.getFullYear(), now.getMonth(), now.getDate());
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setTodayStr(ds);
    setWeekStart(getWeekStart(ds));
  }, []);

  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // `${date}|${shiftId}` → required
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showShiftManage, setShowShiftManage] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [fillLog, setFillLog] = useState<AutoFillLogEntry[] | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ dateStr: string; staffId: number; x: number; y: number } | null>(null);
  // 파괴적 작업 직후 10초간 되돌리기 제공
  const [undoState, setUndoState] = useState<{ label: string; payload: RosterUndoPayload } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 날짜 범위 필터 (빈 문자열 = 제한 없음) — localStorage로 탭 전환 후에도 유지
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  // 첫 마운트/탭 복귀 시엔 localStorage 범위를 유지하고, 이후 cursor·unit 변경 시에만 초기화하기 위한 플래그
  const isFirstCursorEffect = useRef(true);
  // 서버 프리페치 데이터는 최초 1회만 판정·소비 — 월 이동 후 복귀 시 낡은 데이터 재사용 방지
  const initialDataConsumed = useRef(!initialData);

  const monthStart = cursor ? ymdToDateStr(cursor.y, cursor.m, 1) : '';
  const monthEnd = cursor ? ymdToDateStr(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) : '';
  const weekEndStr = weekStart ? addDays(weekStart, 6) : '';
  // 현재 뷰가 로드하는 데이터 범위 — 주 뷰는 월 경계를 넘을 수 있어 월 범위와 별개
  const loadFrom = viewMode === 'week' && weekStart ? weekStart : monthStart;
  const loadTo = viewMode === 'week' && weekStart ? weekEndStr : monthEnd;

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
    setSelectedDate(null);
    // 첫 마운트(탭 복귀 포함)는 범위 유지, 이후 월/단위 변경 시에만 초기화
    if (!isFirstCursorEffect.current) {
      setRangeFrom('');
      setRangeTo('');
    }
    isFirstCursorEffect.current = false;
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
    // loadRange는 cursor·unit·viewMode·weekStart를 클로저로 캡처하므로 deps에 추가하면 무한루프 — 이미 deps로 동기화됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, unit, viewMode, weekStart]);

  // 현재 단위 소속 직원만 (주방 전체 / 해당 매장 캐셔)
  const unitStaff = useMemo(
    () => staffList.filter(s => s.staff_role === unit.staffRole && (unit.staffRole === 'kitchen' || s.store_id === unit.storeId)),
    [staffList, unit],
  );

  const assignMap = useMemo(() => buildAssignMap(assignments), [assignments]);

  const getAssigned = (dateStr: string, shiftId: number) => assignMap.get(`${dateStr}|${shiftId}`) ?? [];

  // 저장된 배정의 규칙 위반 — 배정 id → 사유 목록 (로드된 범위 기준 판정)
  const violations = useMemo(
    () => findRosterViolations(assignments, shifts, unitStaff),
    [assignments, shifts, unitStaff],
  );
  const violationDates = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) if (violations.has(a.id)) set.add(a.work_date);
    return set;
  }, [assignments, violations]);

  const getRequired = (dateStr: string, shift: RosterShift): number => requiredFor(dateStr, shift, overrides);

  // 해당 날짜가 속한 주(일~토)에 이 직원이 근무하는 날 수 — 이달 데이터 기준 근사치, 서버 자동 배정은 정확히 검사함
  const getWeeklyDayCount = (staffId: number, dateStr: string): number => {
    const weekStart = getWeekStart(dateStr);
    const weekEnd = addDays(weekStart, 6);
    const days = new Set(
      assignments
        .filter(a => a.staff_id === staffId && a.work_date >= weekStart && a.work_date <= weekEnd)
        .map(a => a.work_date),
    );
    return days.size;
  };

  // 달력 그리드 — range 모드(from+to 모두 설정)면 해당 날짜만, 아니면 월 전체
  const gridDates = useMemo(() => {
    if (!cursor) return [];

    if (rangeFrom && rangeTo && rangeFrom <= rangeTo) {
      // range 뷰: rangeFrom~rangeTo 포함 주(일~토) 그리드
      const fromDate = parseDate(rangeFrom);
      const toDate = parseDate(rangeTo);
      const weekStart = new Date(fromDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(toDate);
      weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
      const cells: (string | null)[] = [];
      const cur = new Date(weekStart);
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

  // 표시 범위에 속한 배정만 (인원별 합계용)
  const visibleAssignments = useMemo(() => {
    const dateSet = new Set(visibleDates.filter((d): d is string => d !== null));
    return assignments.filter(a => dateSet.has(a.work_date));
  }, [assignments, visibleDates]);

  // 인원 부족 목록 (뷰 범위 적용)
  const shortages = useMemo(() => {
    const list: { date: string; shift: RosterShift; missing: number }[] = [];
    for (const dateStr of visibleDates) {
      if (!dateStr) continue;
      if (viewMode === 'month' && rangeFrom && dateStr < rangeFrom) continue;
      if (viewMode === 'month' && rangeTo && dateStr > rangeTo) continue;
      for (const shift of shifts) {
        const required = getRequired(dateStr, shift);
        const filled = getAssigned(dateStr, shift.id).length;
        if (filled < required) list.push({ date: dateStr, shift, missing: required - filled });
      }
    }
    return list;
    // getRequired는 shifts·overrides를 클로저로 캡처 — 이미 deps에 포함되어 있으므로 별도 등록 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDates, assignMap, overrides, shifts, rangeFrom, rangeTo, viewMode]);

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

  const handleAutoFill = async () => {
    if (!cursor) return;
    // 지난 날짜는 건드리지 않는다
    const from = todayStr > targetFrom ? todayStr : targetFrom;
    if (from > targetTo) { showMsg('지난 날짜는 자동 배정할 수 없습니다'); return; }
    if (!confirm(`${targetLabel} 빈 자리를 자동 배정할까요?\n(오늘 이후 날짜 · 확정 직원 중 조건이 맞는 사람 · 근무일 균등 분배)`)) return;
    setIsAutoFilling(true);
    const r = await autoFillRoster(unit, from, targetTo);
    if (r.success && r.data) {
      const { added, holes, log } = r.data;
      const msg = added === 0
        ? '배정할 수 있는 빈 자리가 없습니다'
        : `${added}자리 배정 완료${holes.length > 0 ? ` · ${holes.length}개 파트 인원 부족` : ''}`;
      showMsg(msg);
      setFillLog(log.length > 0 ? log : null);
      await loadRange();
    } else {
      showMsg(`오류: ${r.error}`);
    }
    setIsAutoFilling(false);
  };

  const offerUndo = (label: string, payload: RosterUndoPayload) => {
    if (payload.deleted.length === 0 && payload.updated.length === 0) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoState({ label, payload });
    undoTimer.current = setTimeout(() => setUndoState(null), 10000);
  };

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const handleUndo = async () => {
    if (!undoState) return;
    const { payload } = undoState;
    setUndoState(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const r = await undoRosterChange(payload);
    if (r.success && r.data) {
      showMsg(`${r.data.restored}건 되돌렸습니다`);
      await loadRange();
    } else {
      showMsg(`오류: ${r.error}`);
    }
  };

  const handleCopyPrevWeek = async () => {
    if (!weekStart) return;
    const prevLabel = `${addDays(weekStart, -7)} ~ ${addDays(weekStart, -1)}`;
    if (!confirm(`직전 주(${prevLabel}) 배정을 이번 주 같은 요일로 복사할까요?\n(지난 날짜는 복사하지 않으며, 이미 있는 배정은 건너뛴 건수로 표시됩니다)`)) return;
    const r = await copyPreviousWeek(unit, weekStart);
    if (r.success && r.data) {
      showMsg(r.data.added === 0
        ? '복사할 배정이 없습니다'
        : `${r.data.added}건 복사됨${r.data.skipped > 0 ? ` · ${r.data.skipped}건 건너뜀` : ''}`);
      await loadRange();
    } else {
      showMsg(`오류: ${r.error}`);
    }
  };

  const handleClearRoster = async () => {
    if (!confirm(`[${unitLabel}] ${targetLabel} 스케줄을 초기화할까요?\n배정된 근무자가 모두 삭제됩니다.`)) return;
    const r = await clearRosterRange(unit, targetFrom, targetTo);
    if (r.success && r.data) {
      setAssignments(p => p.filter(a => a.work_date < targetFrom || a.work_date > targetTo));
      showMsg('스케줄이 초기화됐습니다');
      offerUndo(`${r.data.removed}건 삭제됨`, r.data.undo);
    } else {
      showMsg(`오류: ${r.error}`);
    }
  };

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

  if (!cursor) return <p className="text-ink-faint text-sm">불러오는 중...</p>;

  const unitLabel = unit.staffRole === 'kitchen'
    ? ROLE_LABELS.kitchen
    : (stores.find(s => s.id === unit.storeId)?.name ?? ROLE_LABELS.cashier);

  return (
    <>
    <div className="flex flex-col lg:flex-row gap-3 items-start">
      {/* ── 달력 ── */}
      <div className="flex-1 min-w-0 w-full bg-canvas rounded-2xl p-3 md:p-4 shadow-level-1 border border-hairline">
        {/* 매장 선택 (캐셔일 때만) */}
        {roleFilter === 'cashier' && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-3 border-b border-hairline">
            {stores.length === 0 ? (
              <span className="text-[11px] text-ink-faint">매장을 먼저 등록하면 여기에 나타납니다</span>
            ) : (
              stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => setUnit({ staffRole: 'cashier', storeId: store.id })}
                  className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer transition whitespace-nowrap ${
                    unit.storeId === store.id
                      ? 'bg-primary-700 text-white border-primary-700'
                      : 'bg-canvas text-ink-muted border-hairline hover:border-primary-400'
                  }`}
                >
                  {store.name}
                </button>
              ))
            )}
            <span className="ml-auto text-[11px] text-ink-faint">소속 인원 {unitStaff.length}명</span>
          </div>
        )}
        {roleFilter === 'kitchen' && (
          <div className="flex items-center mb-3 pb-3 border-b border-hairline">
            <span className="text-[12px] font-bold text-ink-muted">주방 전체</span>
            <span className="ml-auto text-[11px] text-ink-faint">소속 인원 {unitStaff.length}명</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <button
              aria-label={viewMode === 'week' ? '이전 주' : '이전 달'}
              className="w-7 h-7 rounded-lg bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm"
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
              className="w-7 h-7 rounded-lg bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm"
              onClick={() => viewMode === 'week'
                ? moveWeek(7)
                : setCursor(c => c && (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
            >
              &gt;
            </button>
            {viewMode === 'week' && (
              <button
                onClick={() => { if (todayStr) { setWeekStart(getWeekStart(todayStr)); syncCursorToDate(todayStr); } }}
                className="px-2 py-1 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
              >
                이번 주
              </button>
            )}
            <div className="flex rounded-lg border border-hairline overflow-hidden ml-1">
              <button
                onClick={() => switchView('month')}
                aria-pressed={viewMode === 'month'}
                className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer border-none transition ${
                  viewMode === 'month' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                }`}
              >
                월
              </button>
              <button
                onClick={() => switchView('week')}
                aria-pressed={viewMode === 'week'}
                className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer border-none transition ${
                  viewMode === 'week' ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
                }`}
              >
                주
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'week' && (
              <button
                onClick={handleCopyPrevWeek}
                disabled={isLoading}
                className="px-2.5 py-1.5 rounded-lg border border-primary-200 bg-primary-50 text-primary-700 text-[11px] font-bold cursor-pointer hover:bg-primary-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                지난주 복사
              </button>
            )}
            <button
              onClick={handleAutoFill}
              disabled={isAutoFilling || isLoading}
              className="px-2.5 py-1.5 rounded-lg border-none bg-primary-700 text-white text-[11px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAutoFilling ? '배정 중...' : '자동 채우기'}
            </button>
            <button
              onClick={handleClearRoster}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 text-[11px] font-bold cursor-pointer hover:bg-rose-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              초기화
            </button>
            <button
              onClick={() => setShowBulkEdit(true)}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              일괄 편집
            </button>
            <button
              onClick={() => setShowShiftManage(true)}
              className="px-2.5 py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
            >
              ⚙ 파트 관리
            </button>
          </div>
        </div>

        {/* 날짜 범위 필터 (월 뷰 전용) */}
        {viewMode === 'month' && (
        <div className="flex items-center gap-1.5 mb-3 p-2 rounded-lg bg-canvas-soft border border-hairline">
          <span className="text-[11px] font-semibold text-ink-muted shrink-0">표시 범위</span>
          <input
            type="date"
            value={rangeFrom}
            min={monthStart}
            max={rangeTo || monthEnd}
            onChange={e => setRangeFrom(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700"
          />
          <span className="text-ink-faint text-[11px] shrink-0">~</span>
          <input
            type="date"
            value={rangeTo}
            min={rangeFrom || monthStart}
            max={monthEnd}
            onChange={e => setRangeTo(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700"
          />
          {(rangeFrom || rangeTo) && (
            <button
              onClick={() => { setRangeFrom(''); setRangeTo(''); }}
              className="shrink-0 text-[11px] font-bold text-primary-600 bg-transparent border-none cursor-pointer hover:text-primary-800 transition whitespace-nowrap"
            >
              전체보기
            </button>
          )}
        </div>
        )}

        {isLoading ? (
          viewMode === 'week' ? <MatrixSkeleton /> : <CalendarGridSkeleton />
        ) : viewMode === 'week' && weekStart ? (
          <WeekMatrix
            weekStart={weekStart}
            todayStr={todayStr}
            shifts={shifts}
            staffList={unitStaff}
            getAssigned={getAssigned}
            getRequired={getRequired}
            violations={violations}
            selectedDate={selectedDate}
            onDateClick={ds => setSelectedDate(prev => (prev === ds ? null : ds))}
          />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>
                {d}
              </div>
            ))}
            {gridDates.map((dateStr, i) => {
              if (!dateStr) return <div key={`empty-${i}`} />;
              const dayNum = Number(dateStr.slice(8));
              const day = i % 7;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const isPast = dateStr < todayStr;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  onDragOver={e => {
                    if (!isPast && e.dataTransfer.types.includes('application/staff-id')) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      setDragOverDate(dateStr);
                    }
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOverDate(null);
                    if (isPast) return;
                    const staffId = parseInt(e.dataTransfer.getData('application/staff-id'));
                    if (isNaN(staffId)) return;
                    const active = shifts.filter(s => (!s.active_from || dateStr >= s.active_from) && (!s.active_to || dateStr <= s.active_to));
                    if (active.length === 0) { showMsg('이 날짜에 활성화된 파트가 없습니다'); return; }
                    if (active.length === 1) { handleAdd(dateStr, active[0].id, staffId); return; }
                    setDropTarget({ dateStr, staffId, x: e.clientX, y: e.clientY });
                  }}
                  className={`flex flex-col gap-0.5 items-stretch rounded-lg border p-1 md:p-1.5 min-h-[64px] cursor-pointer transition text-left bg-canvas ${
                    dragOverDate === dateStr && !isPast
                      ? 'border-primary-500 ring-2 ring-primary-500/20 bg-primary-50/40'
                      : isSelected ? 'border-primary-700 ring-2 ring-primary-700/20' : 'border-hairline hover:border-primary-400'
                  } ${isPast ? 'opacity-50' : ''}`}
                >
                  <span className="flex items-center gap-0.5 mb-0.5">
                    <span className={`text-[11px] font-bold leading-none ${
                      isToday ? 'text-white bg-primary-700 rounded-full w-[18px] h-[18px] flex items-center justify-center'
                      : day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'
                    }`}>
                      {dayNum}
                    </span>
                    {violationDates.has(dateStr) && (
                      <span className="text-[9px] leading-none" title="근무 규칙 위반 있음 (휴식 9시간 미만 또는 주 최대일 초과)">⚠️</span>
                    )}
                  </span>
                  {shifts.map(shift => {
                    const required = getRequired(dateStr, shift);
                    const filled = getAssigned(dateStr, shift.id).length;
                    if (required === 0 && filled === 0) return null;
                    const full = filled >= required;
                    return (
                      <span
                        key={shift.id}
                        className={`text-[9px] md:text-[10px] font-bold rounded px-1 py-0.5 leading-none truncate ${
                          full ? 'bg-emerald-50 text-emerald-700' : filled === 0 ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {shift.name} {filled}/{required}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        )}

        {fillLog && <AutoFillLogPanel fillLog={fillLog} onClose={() => setFillLog(null)} onDateClick={setSelectedDate} />}
        <ShortagesPanel shortages={shortages} isLoading={isLoading} onDateClick={setSelectedDate} />
        <StaffTotalsPanel staffList={unitStaff} shifts={shifts} assignments={visibleAssignments} isLoading={isLoading} />
      </div>

      {/* ── 날짜 상세 패널 ── */}
      {selectedDate && (
        <DayPanel
          dateStr={selectedDate}
          shifts={shifts}
          staffList={unitStaff}
          overrides={overrides}
          violations={violations}
          getAssigned={getAssigned}
          getRequired={getRequired}
          getWeeklyDayCount={getWeeklyDayCount}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onTimeChange={handleTimeChange}
          onRequirementChange={handleRequirementChange}
          onRequirementReset={handleRequirementReset}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {showShiftManage && (
        <ShiftManageModal
          unit={unit}
          unitLabel={unitLabel}
          shifts={shifts}
          onShiftsChange={setShifts}
          onClose={() => setShowShiftManage(false)}
        />
      )}

      {showBulkEdit && (
        <BulkEditModal
          unit={unit}
          unitLabel={unitLabel}
          shifts={shifts}
          staffList={unitStaff}
          assignments={assignments}
          defaultFrom={targetFrom}
          defaultTo={targetTo}
          monthStart={loadFrom}
          monthEnd={loadTo}
          todayStr={todayStr}
          onApplied={loadRange}
          onUndoable={offerUndo}
          onClose={() => setShowBulkEdit(false)}
        />
      )}
    </div>
    {dropTarget && createPortal(
      <>
        <div className="fixed inset-0 z-[49]" onClick={() => setDropTarget(null)} />
        <div
          className="fixed z-50 bg-canvas border border-hairline rounded-xl shadow-level-2 p-2 min-w-[160px]"
          style={{ left: dropTarget.x + 8, top: dropTarget.y + 8 }}
        >
          <p className="m-0 mb-1.5 text-[10px] font-bold text-ink-muted px-1">파트 선택</p>
          {shifts
            .filter(s => (!s.active_from || dropTarget.dateStr >= s.active_from) && (!s.active_to || dropTarget.dateStr <= s.active_to))
            .map(s => (
              <button
                key={s.id}
                onClick={() => { handleAdd(dropTarget.dateStr, s.id, dropTarget.staffId); setDropTarget(null); }}
                className="w-full text-left px-3 py-1.5 rounded-lg text-[12px] hover:bg-canvas-soft cursor-pointer bg-transparent border-none transition"
              >
                {s.name} <span className="text-ink-faint text-[10px]">{s.start_time}~{s.end_time}</span>
              </button>
            ))
          }
          <button onClick={() => setDropTarget(null)} className="w-full text-center text-[10px] text-ink-faint mt-1 bg-transparent border-none cursor-pointer hover:text-ink transition">취소</button>
        </div>
      </>,
      document.body,
    )}
    {undoState && createPortal(
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-[#161616] text-white rounded-xl px-4 py-2.5 shadow-level-2">
        <span className="text-[12px] font-semibold">{undoState.label}</span>
        <button
          onClick={handleUndo}
          className="px-2.5 py-1 rounded-lg bg-white/15 border-none text-white text-[12px] font-bold cursor-pointer hover:bg-white/25 transition"
        >
          되돌리기
        </button>
        <button
          onClick={() => setUndoState(null)}
          aria-label="되돌리기 알림 닫기"
          className="bg-transparent border-none text-white/60 text-[14px] cursor-pointer leading-none hover:text-white transition"
        >
          ×
        </button>
      </div>,
      document.body,
    )}
    </>
  );
}

// ── 날짜 상세 패널 ────────────────────────────────────────────────────────────

function DayPanel({
  dateStr, shifts, staffList, overrides, violations,
  getAssigned, getRequired, getWeeklyDayCount, onAdd, onRemove, onTimeChange,
  onRequirementChange, onRequirementReset, onClose,
}: {
  dateStr: string;
  shifts: RosterShift[];
  staffList: StaffProfile[];
  overrides: Record<string, number>;
  violations: Map<number, string[]>;
  getAssigned: (d: string, shiftId: number) => RosterAssignment[];
  getRequired: (d: string, s: RosterShift) => number;
  getWeeklyDayCount: (staffId: number, d: string) => number;
  onAdd: (d: string, shiftId: number, staffId: number) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
  onTimeChange: (id: number, start: string | null, end: string | null) => Promise<void>;
  onRequirementChange: (d: string, shiftId: number, required: number) => Promise<void>;
  onRequirementReset: (d: string, shiftId: number) => Promise<void>;
  onClose: () => void;
}) {
  const day = dayOfWeek(dateStr);
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [copying, setCopying] = useState(false);
  // 날짜 선택/변경 시 패널로 포커스 이동 — 키보드·스크린리더 사용자에게 열림을 알림
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { panelRef.current?.focus(); }, [dateStr]);

  // 배정 후보: 불합격/퇴사 제외
  const selectableStaff = staffList.filter(s => s.status === 'confirmed' || s.status === 'candidate');

  const handleCopy = async () => {
    setCopying(true);
    try {
      const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
      const m = Number(dateStr.slice(5, 7));
      const dd = Number(dateStr.slice(8));
      const dateLabel = `${m}월 ${dd}일(${DAYS[day]})`;

      const lines: string[] = [`📋 ${dateLabel} 근무 안내`, ''];
      let hasAny = false;

      for (const shift of shifts) {
        const assigned = getAssigned(dateStr, shift.id);
        if (assigned.length === 0) continue;
        hasAny = true;
        lines.push(`[${shift.name}] ${shift.start_time}~${shift.end_time}`);
        for (const a of assigned) {
          lines.push(`· ${a.staff_profiles?.name ?? ''}`);
        }
        lines.push('');
      }

      if (!hasAny) {
        await navigator.clipboard.writeText(`📋 ${dateLabel} 근무 안내\n\n배정된 근무자가 없습니다.`);
      } else {
        await navigator.clipboard.writeText(lines.join('\n').trimEnd());
      }
      showMsg('클립보드에 복사됐습니다!');
    } catch {
      showMsg('복사 실패 — 브라우저 권한을 확인해주세요.');
    } finally {
      setCopying(false);
    }
  };

  const prevDay = prevDate(dateStr);
  const prevDayEnds = new Map<number, string>(); // staff_id → 전날 퇴근 시간
  for (const sh of shifts) {
    for (const a of getAssigned(prevDay, sh.id)) {
      prevDayEnds.set(a.staff_id, a.end_time ?? sh.end_time);
    }
  }

  return (
    <div ref={panelRef} tabIndex={-1} className="w-full lg:w-[340px] shrink-0 bg-canvas rounded-2xl p-4 shadow-level-1 border border-hairline focus:outline-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-[15px] font-extrabold">
          {Number(dateStr.slice(5, 7))}월 {Number(dateStr.slice(8))}일
          <span className={`ml-1 ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>({DAY_NAMES[day]})</span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={copying}
            className="px-2.5 py-1 rounded-lg bg-canvas-soft border border-hairline text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition disabled:opacity-50"
          >
            {copying ? '복사 중...' : '복사'}
          </button>
          <button onClick={onClose} aria-label="날짜 상세 닫기" className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
        </div>
      </div>

      {shifts.map((shift, shiftIdx) => {
        const assigned = getAssigned(dateStr, shift.id);
        const required = getRequired(dateStr, shift);
        const hasOverride = overrides[`${dateStr}|${shift.id}`] !== undefined;
        const assignedIds = new Set(assigned.map(a => a.staff_id));
        const candidates = selectableStaff
          .map(s => {
            const { reasons } = checkStaffAvailability(s, dateStr, shift);
            if (s.max_days_per_week != null && getWeeklyDayCount(s.id, dateStr) >= s.max_days_per_week) {
              reasons.push(`주 ${s.max_days_per_week}일 도달`);
            }
            const prevEnd = prevDayEnds.get(s.id);
            if (prevEnd && toMinutes(shift.start_time) + 24 * 60 - toMinutes(prevEnd) < MIN_REST_MINUTES) {
              reasons.push('전날 야간 근무 (9h 미만 휴식)');
            }
            return { staff: s, avail: { ok: reasons.length === 0, reasons } };
          })
          .sort((a, b) => Number(b.avail.ok) - Number(a.avail.ok));

        return (
          <div key={shift.id} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[12px] font-extrabold ${shiftTextColor(shiftIdx)}`}>
                {shift.name} <span className="text-ink-faint font-semibold">{shift.start_time}~{shift.end_time}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onRequirementChange(dateStr, shift.id, Math.max(0, required - 1))}
                  aria-label={`${shift.name} 필요 인원 줄이기`}
                  className="w-5 h-5 rounded bg-canvas-soft border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  −
                </button>
                <span className={`text-[11px] font-bold ${assigned.length >= required ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {assigned.length}/{required}
                </span>
                <button
                  onClick={() => onRequirementChange(dateStr, shift.id, required + 1)}
                  aria-label={`${shift.name} 필요 인원 늘리기`}
                  className="w-5 h-5 rounded bg-canvas-soft border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  +
                </button>
                {hasOverride && (
                  <button
                    onClick={() => onRequirementReset(dateStr, shift.id)}
                    title="기본 인원으로 되돌리기"
                    className="text-[10px] text-primary-600 font-bold bg-transparent border-none cursor-pointer hover:text-primary-800 transition"
                  >
                    기본값
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {assigned.map(a => (
                <div key={a.id} className="flex items-center gap-1.5 bg-canvas-soft rounded-lg px-2.5 py-1.5">
                  {editingTimeId === a.id ? (
                    <>
                      <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="flex-1 min-w-0 px-1 py-0.5 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <span className="text-ink-faint text-[10px]">~</span>
                      <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="flex-1 min-w-0 px-1 py-0.5 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <button
                        onClick={async () => { await onTimeChange(a.id, editStart || null, editEnd || null); setEditingTimeId(null); }}
                        className="shrink-0 text-[10px] font-bold text-white bg-primary-700 border-none rounded px-1.5 py-1 cursor-pointer hover:bg-primary-800 transition"
                      >
                        저장
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[12px] font-bold text-ink flex-1 min-w-0 truncate">
                        {a.staff_profiles?.name ?? `#${a.staff_id}`}
                        {violations.get(a.id) && (
                          <span className="ml-1 text-[10px]" title={violations.get(a.id)!.join(', ')}>⚠️</span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setEditingTimeId(a.id);
                          setEditStart(a.start_time ?? shift.start_time);
                          setEditEnd(a.end_time ?? shift.end_time);
                        }}
                        title="시간 수정"
                        className={`text-[10px] bg-transparent border-none cursor-pointer transition ${a.start_time ? 'text-primary-700 font-bold' : 'text-ink-faint hover:text-primary-700'}`}
                      >
                        {a.start_time ? `${a.start_time}~${a.end_time}` : '기본시간'}
                      </button>
                      <button
                        onClick={() => onRemove(a.id)}
                        aria-label={`${a.staff_profiles?.name ?? `#${a.staff_id}`} 배정 삭제`}
                        className="shrink-0 bg-transparent border-none text-ink-faint cursor-pointer text-[13px] leading-none hover:text-rose-500 transition"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}

              {/* 인원 추가 */}
              <select
                value=""
                onChange={e => { if (e.target.value) onAdd(dateStr, shift.id, Number(e.target.value)); }}
                className="w-full px-2 py-1.5 border border-dashed border-hairline rounded-lg text-[11px] text-ink-muted bg-canvas cursor-pointer focus:outline-none focus:border-primary-700"
              >
                <option value="">+ 인원 추가</option>
                {candidates.map(({ staff, avail }) => (
                  <option key={staff.id} value={staff.id}>
                    {avail.ok ? '✓' : '✗'} {staff.name}
                    {staff.status === 'candidate' ? ` (${STATUS_LABELS.candidate})` : ''}
                    {!avail.ok ? ` — ${avail.reasons.join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
