'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { showMsg } from '@/lib/toast';
import {
  fetchRosterRange, addRosterAssignment, removeRosterAssignment,
  updateRosterAssignmentTime, setShiftRequirement, clearShiftRequirement, autoFillRoster,
} from '@/app/actions/roster';
import type { RosterUnit } from '@/app/actions/roster';
import type { StaffProfile, Store, RosterShift, RosterAssignment } from '@/types/database';
import { DAY_NAMES, STATUS_LABELS, ROLE_LABELS, checkStaffAvailability } from './constants';
import { getWeekStart } from '@/lib/staffing';
import ShiftManageModal from './ShiftManageModal';

interface Props {
  staffList: StaffProfile[];
  stores: Store[];
}

// 파트 순서에 따라 순환하는 강조색
const SHIFT_TEXT_COLORS = ['text-orange-600', 'text-indigo-600', 'text-emerald-600', 'text-rose-500', 'text-cyan-600'] as const;
export function shiftTextColor(index: number): string {
  return SHIFT_TEXT_COLORS[index % SHIFT_TEXT_COLORS.length];
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function RosterCalendar({ staffList, stores }: Props) {
  // 단위 = 주방 전체 또는 캐셔의 특정 매장
  const [unit, setUnit] = useState<RosterUnit>({ staffRole: 'kitchen', storeId: null });
  // 월 커서 — SSR/hydration 불일치를 피하려고 마운트 후 초기화
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [todayStr, setTodayStr] = useState('');
  useEffect(() => {
    const now = new Date();
    setCursor({ y: now.getFullYear(), m: now.getMonth() });
    setTodayStr(toDateStr(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);

  const [shifts, setShifts] = useState<RosterShift[]>([]);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // `${date}|${shiftId}` → required
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showShiftManage, setShowShiftManage] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  // 날짜 범위 필터 (빈 문자열 = 제한 없음) — localStorage로 탭 전환 후에도 유지
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const isFirstCursorEffect = useRef(true);

  const monthStart = cursor ? toDateStr(cursor.y, cursor.m, 1) : '';
  const monthEnd = cursor ? toDateStr(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) : '';

  const loadRange = async () => {
    if (!cursor) return;
    const r = await fetchRosterRange(unit, monthStart, monthEnd);
    if (r.success && r.data) {
      setShifts(r.data.shifts);
      setAssignments(r.data.assignments);
      setOverrides(Object.fromEntries(r.data.requirements.map(q => [`${q.work_date}|${q.shift_id}`, q.required])));
    }
  };

  // 마운트 시 localStorage에서 범위 복원
  useEffect(() => {
    setRangeFrom(localStorage.getItem('roster_rangeFrom') ?? '');
    setRangeTo(localStorage.getItem('roster_rangeTo') ?? '');
  }, []);

  // 범위 변경 시 localStorage 저장
  useEffect(() => {
    localStorage.setItem('roster_rangeFrom', rangeFrom);
    localStorage.setItem('roster_rangeTo', rangeTo);
  }, [rangeFrom, rangeTo]);

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
    loadRange().then(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, unit]);

  // 현재 단위 소속 직원만 (주방 전체 / 해당 매장 캐셔)
  const unitStaff = useMemo(
    () => staffList.filter(s => s.staff_role === unit.staffRole && (unit.staffRole === 'kitchen' || s.store_id === unit.storeId)),
    [staffList, unit],
  );

  const assignMap = useMemo(() => {
    const map = new Map<string, RosterAssignment[]>();
    for (const a of assignments) {
      const key = `${a.work_date}|${a.shift_id}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(a); else map.set(key, [a]);
    }
    return map;
  }, [assignments]);

  const getAssigned = (dateStr: string, shiftId: number) => assignMap.get(`${dateStr}|${shiftId}`) ?? [];

  const getRequired = (dateStr: string, shift: RosterShift): number => {
    const override = overrides[`${dateStr}|${shift.id}`];
    if (override !== undefined) return override;
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return day === 0 || day === 6 ? shift.weekend_required : shift.weekday_required;
  };

  // 해당 날짜가 속한 주(일~토)에 이 직원이 근무하는 날 수 — 이달 데이터 기준 근사치, 서버 자동 배정은 정확히 검사함
  const getWeeklyDayCount = (staffId: number, dateStr: string): number => {
    const weekStart = getWeekStart(dateStr);
    const endD = new Date(weekStart + 'T00:00:00');
    endD.setDate(endD.getDate() + 6);
    const weekEnd = toDateStr(endD.getFullYear(), endD.getMonth(), endD.getDate());
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
      const fromDate = new Date(rangeFrom + 'T00:00:00');
      const toDate = new Date(rangeTo + 'T00:00:00');
      const weekStart = new Date(fromDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(toDate);
      weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
      const cells: (string | null)[] = [];
      const cur = new Date(weekStart);
      while (cur <= weekEnd) {
        const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        cells.push(ds >= rangeFrom && ds <= rangeTo ? ds : null);
        cur.setDate(cur.getDate() + 1);
      }
      return cells;
    }

    // 월 전체 그리드
    const firstDay = new Date(cursor.y, cursor.m, 1).getDay();
    const lastDate = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= lastDate; d++) cells.push(toDateStr(cursor.y, cursor.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor, rangeFrom, rangeTo]);

  // 이달의 인원 부족 목록 (범위 적용)
  const shortages = useMemo(() => {
    const list: { date: string; shift: RosterShift; missing: number }[] = [];
    for (const dateStr of gridDates) {
      if (!dateStr) continue;
      if (rangeFrom && dateStr < rangeFrom) continue;
      if (rangeTo && dateStr > rangeTo) continue;
      for (const shift of shifts) {
        const required = getRequired(dateStr, shift);
        const filled = getAssigned(dateStr, shift.id).length;
        if (filled < required) list.push({ date: dateStr, shift, missing: required - filled });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridDates, assignMap, overrides, shifts, rangeFrom, rangeTo]);

  const handleAutoFill = async () => {
    if (!cursor) return;
    const effectiveStart = rangeFrom || monthStart;
    const effectiveEnd = rangeTo || monthEnd;
    // 지난 날짜는 건드리지 않는다
    const from = todayStr > effectiveStart ? todayStr : effectiveStart;
    if (from > effectiveEnd) { showMsg('지난 날짜는 자동 배정할 수 없습니다'); return; }
    const rangeLabel = (rangeFrom || rangeTo) ? `${rangeFrom || monthStart} ~ ${rangeTo || monthEnd}` : `${cursor.m + 1}월 전체`;
    if (!confirm(`${rangeLabel} 빈 자리를 자동 배정할까요?\n(오늘 이후 날짜 · 확정 직원 중 조건이 맞는 사람 · 근무일 균등 분배)`)) return;
    setIsAutoFilling(true);
    const r = await autoFillRoster(unit, from, effectiveEnd);
    if (r.success && r.data) {
      showMsg(r.data.added === 0
        ? '배정할 수 있는 빈 자리가 없습니다'
        : `${r.data.added}자리 배정 완료${r.data.holes.length > 0 ? ` · ${r.data.holes.length}개 파트는 가능 인원 부족` : ''}`);
      await loadRange();
    } else {
      showMsg(`오류: ${r.error}`);
    }
    setIsAutoFilling(false);
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
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* ── 달력 ── */}
      <div className="flex-1 min-w-0 w-full bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
        {/* 단위 선택: 주방 / 매장별 캐셔 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-3 border-b border-hairline">
          <button
            onClick={() => setUnit({ staffRole: 'kitchen', storeId: null })}
            className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer transition ${
              unit.staffRole === 'kitchen'
                ? 'bg-ink text-white border-ink'
                : 'bg-canvas text-ink-muted border-hairline hover:border-ink'
            }`}
          >
            {ROLE_LABELS.kitchen}
          </button>
          {stores.map(store => (
            <button
              key={store.id}
              onClick={() => setUnit({ staffRole: 'cashier', storeId: store.id })}
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-bold cursor-pointer transition whitespace-nowrap ${
                unit.staffRole === 'cashier' && unit.storeId === store.id
                  ? 'bg-primary-700 text-white border-primary-700'
                  : 'bg-canvas text-ink-muted border-hairline hover:border-primary-400'
              }`}
            >
              {store.name}
            </button>
          ))}
          {stores.length === 0 && (
            <span className="text-[11px] text-ink-faint">
              캐셔 스케줄은 직원 관리 탭에서 매장을 먼저 등록하면 여기에 나타납니다
            </span>
          )}
          <span className="ml-auto text-[11px] text-ink-faint">
            소속 인원 {unitStaff.length}명
          </span>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              className="w-7 h-7 rounded-lg bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm"
              onClick={() => setCursor(c => c && (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))}
            >
              &lt;
            </button>
            <h3 className="m-0 text-base font-extrabold w-[110px] text-center">{cursor.y}년 {cursor.m + 1}월</h3>
            <button
              className="w-7 h-7 rounded-lg bg-canvas-soft border-none cursor-pointer font-bold text-ink-muted hover:bg-[#ececeb] transition text-sm"
              onClick={() => setCursor(c => c && (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))}
            >
              &gt;
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoFill}
              disabled={isAutoFilling || isLoading}
              className="px-2.5 py-1.5 rounded-lg border-none bg-primary-700 text-white text-[11px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAutoFilling ? '배정 중...' : '⚡ 자동 채우기'}
            </button>
            <button
              onClick={() => setShowShiftManage(true)}
              className="px-2.5 py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
            >
              ⚙ 파트 관리
            </button>
          </div>
        </div>

        {/* 날짜 범위 필터 */}
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

        {isLoading ? (
          <p className="text-ink-faint text-sm">불러오는 중...</p>
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
                  className={`flex flex-col gap-0.5 items-stretch rounded-lg border p-1 md:p-1.5 min-h-[64px] cursor-pointer transition text-left bg-canvas ${
                    isSelected ? 'border-primary-700 ring-2 ring-primary-700/20' : 'border-hairline hover:border-primary-400'
                  } ${isPast ? 'opacity-50' : ''}`}
                >
                  <span className={`text-[11px] font-bold leading-none mb-0.5 ${
                    isToday ? 'text-white bg-primary-700 rounded-full w-[18px] h-[18px] flex items-center justify-center'
                    : day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'
                  }`}>
                    {dayNum}
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

        {/* 이달 부족 인원 요약 */}
        {!isLoading && shortages.length > 0 && (
          <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3">
            <p className="m-0 mb-1.5 text-[12px] font-bold text-rose-600">⚠ 인원 부족 ({shortages.length}건)</p>
            <div className="flex flex-wrap gap-1.5">
              {shortages.map(s => {
                const day = new Date(s.date + 'T00:00:00').getDay();
                return (
                  <button
                    key={`${s.date}-${s.shift.id}`}
                    onClick={() => setSelectedDate(s.date)}
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-canvas border border-rose-200 text-rose-600 cursor-pointer hover:bg-rose-100 transition"
                  >
                    {Number(s.date.slice(5, 7))}/{Number(s.date.slice(8))}({DAY_NAMES[day]}) {s.shift.name} {s.missing}명
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!isLoading && shortages.length === 0 && (
          <p className="mt-3 m-0 text-[12px] text-emerald-600 font-semibold">✓ 이달 모든 파트 인원이 채워졌습니다</p>
        )}
      </div>

      {/* ── 날짜 상세 패널 ── */}
      {selectedDate && (
        <DayPanel
          dateStr={selectedDate}
          shifts={shifts}
          staffList={unitStaff}
          overrides={overrides}
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
    </div>
  );
}

// ── 날짜 상세 패널 ────────────────────────────────────────────────────────────

function DayPanel({
  dateStr, shifts, staffList, overrides,
  getAssigned, getRequired, getWeeklyDayCount, onAdd, onRemove, onTimeChange,
  onRequirementChange, onRequirementReset, onClose,
}: {
  dateStr: string;
  shifts: RosterShift[];
  staffList: StaffProfile[];
  overrides: Record<string, number>;
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
  const day = new Date(dateStr + 'T00:00:00').getDay();
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // 배정 후보: 불합격/퇴사 제외
  const selectableStaff = staffList.filter(s => s.status === 'confirmed' || s.status === 'candidate');

  return (
    <div className="w-full lg:w-[340px] shrink-0 bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-[15px] font-extrabold">
          {Number(dateStr.slice(5, 7))}월 {Number(dateStr.slice(8))}일
          <span className={`ml-1 ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>({DAY_NAMES[day]})</span>
        </h3>
        <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
      </div>

      {shifts.map((shift, shiftIdx) => {
        const assigned = getAssigned(dateStr, shift.id);
        const required = getRequired(dateStr, shift);
        const hasOverride = overrides[`${dateStr}|${shift.id}`] !== undefined;
        const assignedIds = new Set(assigned.map(a => a.staff_id));
        const candidates = selectableStaff
          .filter(s => !assignedIds.has(s.id))
          .map(s => {
            const { reasons } = checkStaffAvailability(s, dateStr, shift);
            if (s.max_days_per_week != null && getWeeklyDayCount(s.id, dateStr) >= s.max_days_per_week) {
              reasons.push(`주 ${s.max_days_per_week}일 도달`);
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
                  className="w-5 h-5 rounded bg-canvas-soft border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  −
                </button>
                <span className={`text-[11px] font-bold ${assigned.length >= required ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {assigned.length}/{required}
                </span>
                <button
                  onClick={() => onRequirementChange(dateStr, shift.id, required + 1)}
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
                      <span className="text-[12px] font-bold text-ink flex-1 min-w-0 truncate">{a.staff_profiles?.name ?? `#${a.staff_id}`}</span>
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
