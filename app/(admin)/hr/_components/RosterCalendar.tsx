'use client';

import { useEffect, useMemo, useState } from 'react';
import { showMsg } from '@/lib/toast';
import { autoFillRoster, clearRosterRange, copyPreviousWeek } from '@/app/actions/roster';
import type { RosterUnit, RosterMonthData, AutoFillLogEntry } from '@/app/actions/roster';
import type { StaffProfile, Store, StaffRole, RosterShift } from '@/types/database';
import { ROLE_LABELS } from './constants';
import { getWeekStart, findRosterViolations, requiredFor, buildAssignMap } from '@/lib/staffing';
import { addDays } from '@/lib/date';
import { CalendarGridSkeleton, MatrixSkeleton } from '@/components/Skeleton';
import { useRosterView } from './roster/useRosterView';
import { useRosterRange } from './roster/useRosterRange';
import { useUndoToast } from './roster/useUndoToast';
import DayPanel from './roster/DayPanel';
import MonthGrid from './roster/MonthGrid';
import UndoToast from './roster/UndoToast';
import ShiftPickerPopover from './roster/ShiftPickerPopover';
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
  // 뷰 상태(월 커서·월/주 토글·범위 필터·선택 날짜 + localStorage 동기화)
  const {
    cursor, setCursor, todayStr, viewMode, weekStart, setWeekStart,
    selectedDate, setSelectedDate, rangeFrom, setRangeFrom, rangeTo, setRangeTo,
    resetOnCursorChange, monthStart, monthEnd, weekEndStr, loadFrom, loadTo,
    gridDates, visibleDates, targetFrom, targetTo, targetLabel,
    syncCursorToDate, moveWeek, switchView,
  } = useRosterView();

  // 데이터(파트·배정·요구 인원) 로딩 + 단건 변경
  const {
    shifts, setShifts, assignments, setAssignments, overrides, isLoading, loadRange,
    handleAdd, handleRemove, handleTimeChange, handleRequirementChange, handleRequirementReset,
  } = useRosterRange({
    unit, staffList, cursor, viewMode, weekStart, loadFrom, loadTo,
    initialData, refreshSignal, onCursorChange: resetOnCursorChange,
  });

  const { undoState, offerUndo, handleUndo, dismissUndo } = useUndoToast(loadRange);

  const [showShiftManage, setShowShiftManage] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [fillLog, setFillLog] = useState<AutoFillLogEntry[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ dateStr: string; staffId: number; x: number; y: number } | null>(null);

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

  // 직원 드롭 처리 — 활성 파트가 하나면 즉시 배정, 여럿이면 커서 위치에 파트 선택 팝오버
  const handleDropStaff = (dateStr: string, staffId: number, x: number, y: number) => {
    const active = shifts.filter(s => (!s.active_from || dateStr >= s.active_from) && (!s.active_to || dateStr <= s.active_to));
    if (active.length === 0) { showMsg('이 날짜에 활성화된 파트가 없습니다'); return; }
    if (active.length === 1) { handleAdd(dateStr, active[0].id, staffId); return; }
    setDropTarget({ dateStr, staffId, x, y });
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
          <MonthGrid
            gridDates={gridDates}
            todayStr={todayStr}
            selectedDate={selectedDate}
            shifts={shifts}
            violationDates={violationDates}
            getAssigned={getAssigned}
            getRequired={getRequired}
            onSelectDate={setSelectedDate}
            onDropStaff={handleDropStaff}
          />
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
          context={{ unit, unitLabel, shifts, staffList: unitStaff, assignments, todayStr }}
          range={{ defaultFrom: targetFrom, defaultTo: targetTo, monthStart: loadFrom, monthEnd: loadTo }}
          onApplied={loadRange}
          onUndoable={offerUndo}
          onClose={() => setShowBulkEdit(false)}
        />
      )}
    </div>
    {dropTarget && (
      <ShiftPickerPopover
        dateStr={dropTarget.dateStr}
        x={dropTarget.x}
        y={dropTarget.y}
        shifts={shifts}
        onPick={shiftId => { handleAdd(dropTarget.dateStr, shiftId, dropTarget.staffId); setDropTarget(null); }}
        onClose={() => setDropTarget(null)}
      />
    )}
    {undoState && (
      <UndoToast label={undoState.label} onUndo={handleUndo} onDismiss={dismissUndo} />
    )}
    </>
  );
}
