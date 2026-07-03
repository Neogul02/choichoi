'use client';

import { useEffect, useMemo, useState } from 'react';
import { showMsg } from '@/lib/toast';
import {
  fetchRosterSettings, saveRosterSettings, fetchRosterRange,
  addRosterAssignment, removeRosterAssignment, updateRosterAssignmentTime,
  setRosterRequirement, clearRosterRequirement, autoFillRoster,
} from '@/app/actions/roster';
import type { RosterUnit } from '@/app/actions/roster';
import type { StaffProfile, Store, RosterSettings, RosterRequirement, RosterAssignment } from '@/types/database';
import { DAY_NAMES, STATUS_LABELS, ROLE_LABELS, checkStaffAvailability } from './constants';
import { getWeekStart } from '@/lib/staffing';
import RosterSettingsModal from './RosterSettingsModal';

interface Props {
  staffList: StaffProfile[];
  stores: Store[];
}

type Shift = 'AM' | 'PM';
const SHIFTS: Shift[] = ['AM', 'PM'];

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

  const [settings, setSettings] = useState<RosterSettings | null>(null);
  const [assignments, setAssignments] = useState<RosterAssignment[]>([]);
  const [requirements, setRequirements] = useState<Record<string, RosterRequirement>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  useEffect(() => {
    setSettings(null);
    fetchRosterSettings(unit).then(r => { if (r.success && r.data) setSettings(r.data); });
  }, [unit]);

  const monthStart = cursor ? toDateStr(cursor.y, cursor.m, 1) : '';
  const monthEnd = cursor ? toDateStr(cursor.y, cursor.m, new Date(cursor.y, cursor.m + 1, 0).getDate()) : '';

  useEffect(() => {
    if (!cursor) return;
    setIsLoading(true);
    setSelectedDate(null);
    fetchRosterRange(unit, monthStart, monthEnd).then(r => {
      if (r.success && r.data) {
        setAssignments(r.data.assignments);
        setRequirements(Object.fromEntries(r.data.requirements.map(q => [q.work_date, q])));
      }
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, unit]);

  // 현재 단위 소속 직원만 (주방 전체 / 해당 매장 캐셔)
  const unitStaff = useMemo(
    () => staffList.filter(s => s.staff_role === unit.staffRole && (unit.staffRole === 'kitchen' || s.store_id === unit.storeId)),
    [staffList, unit],
  );

  const handleAutoFill = async () => {
    if (!cursor) return;
    // 지난 날짜는 건드리지 않는다
    const from = todayStr > monthStart ? todayStr : monthStart;
    if (from > monthEnd) { showMsg('지난 달은 자동 배정할 수 없습니다'); return; }
    if (!confirm(`${cursor.m + 1}월의 빈 자리를 자동 배정할까요?\n(오늘 이후 날짜 · 확정 직원 중 조건이 맞는 사람 · 근무일 균등 분배)`)) return;
    setIsAutoFilling(true);
    const r = await autoFillRoster(unit, from, monthEnd);
    if (r.success && r.data) {
      showMsg(r.data.added === 0
        ? '배정할 수 있는 빈 자리가 없습니다'
        : `${r.data.added}자리 배정 완료${r.data.holes.length > 0 ? ` · ${r.data.holes.length}개 파트는 가능 인원 부족` : ''}`);
      const reload = await fetchRosterRange(unit, monthStart, monthEnd);
      if (reload.success && reload.data) {
        setAssignments(reload.data.assignments);
        setRequirements(Object.fromEntries(reload.data.requirements.map(q => [q.work_date, q])));
      }
    } else {
      showMsg(`오류: ${r.error}`);
    }
    setIsAutoFilling(false);
  };

  const assignMap = useMemo(() => {
    const map = new Map<string, RosterAssignment[]>();
    for (const a of assignments) {
      const key = `${a.work_date}|${a.shift}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(a); else map.set(key, [a]);
    }
    return map;
  }, [assignments]);

  const getAssigned = (dateStr: string, shift: Shift) => assignMap.get(`${dateStr}|${shift}`) ?? [];

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

  const getRequired = (dateStr: string, shift: Shift): number => {
    const override = requirements[dateStr];
    if (override) return shift === 'AM' ? override.am_required : override.pm_required;
    if (!settings) return 0;
    const day = new Date(dateStr + 'T00:00:00').getDay();
    const isWeekend = day === 0 || day === 6;
    if (shift === 'AM') return isWeekend ? settings.weekend_am_required : settings.weekday_am_required;
    return isWeekend ? settings.weekend_pm_required : settings.weekday_pm_required;
  };

  // 달력 그리드 (앞쪽 빈칸 포함)
  const gridDates = useMemo(() => {
    if (!cursor) return [];
    const firstDay = new Date(cursor.y, cursor.m, 1).getDay();
    const lastDate = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= lastDate; d++) cells.push(toDateStr(cursor.y, cursor.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // 이달의 인원 부족 목록
  const shortages = useMemo(() => {
    const list: { date: string; shift: Shift; missing: number }[] = [];
    for (const dateStr of gridDates) {
      if (!dateStr) continue;
      for (const shift of SHIFTS) {
        const required = getRequired(dateStr, shift);
        const filled = getAssigned(dateStr, shift).length;
        if (filled < required) list.push({ date: dateStr, shift, missing: required - filled });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridDates, assignMap, requirements, settings]);

  const handleAdd = async (dateStr: string, shift: Shift, staffId: number) => {
    const r = await addRosterAssignment(unit, dateStr, shift, staffId);
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

  const handleRequirementChange = async (dateStr: string, am: number, pm: number) => {
    const r = await setRosterRequirement(unit, dateStr, am, pm);
    if (r.success && r.data) setRequirements(p => ({ ...p, [dateStr]: r.data! }));
    else showMsg(`오류: ${r.error}`);
  };

  const handleRequirementReset = async (dateStr: string) => {
    const r = await clearRosterRequirement(unit, dateStr);
    if (r.success) setRequirements(p => { const n = { ...p }; delete n[dateStr]; return n; });
    else showMsg(`오류: ${r.error}`);
  };

  if (!cursor) return <p className="text-ink-faint text-sm">불러오는 중...</p>;

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

        <div className="flex items-center justify-between mb-3">
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
            {settings && (
              <span className="hidden md:inline text-[11px] text-ink-faint">
                오전 {settings.am_start}~{settings.am_end} · 오후 {settings.pm_start}~{settings.pm_end}
              </span>
            )}
            <button
              onClick={handleAutoFill}
              disabled={isAutoFilling || isLoading}
              className="px-2.5 py-1.5 rounded-lg border-none bg-primary-700 text-white text-[11px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isAutoFilling ? '배정 중...' : '⚡ 자동 채우기'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="px-2.5 py-1.5 rounded-lg bg-canvas-soft border-none text-[11px] font-bold text-ink-muted cursor-pointer hover:bg-[#ececeb] transition"
            >
              ⚙ 설정
            </button>
          </div>
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
                  {SHIFTS.map(shift => {
                    const required = getRequired(dateStr, shift);
                    const filled = getAssigned(dateStr, shift).length;
                    if (required === 0 && filled === 0) return null;
                    const full = filled >= required;
                    return (
                      <span
                        key={shift}
                        className={`text-[9px] md:text-[10px] font-bold rounded px-1 py-0.5 leading-none ${
                          full ? 'bg-emerald-50 text-emerald-700' : filled === 0 ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {shift === 'AM' ? '오전' : '오후'} {filled}/{required}
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
                    key={`${s.date}-${s.shift}`}
                    onClick={() => setSelectedDate(s.date)}
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-canvas border border-rose-200 text-rose-600 cursor-pointer hover:bg-rose-100 transition"
                  >
                    {Number(s.date.slice(5, 7))}/{Number(s.date.slice(8))}({DAY_NAMES[day]}) {s.shift === 'AM' ? '오전' : '오후'} {s.missing}명
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
      {selectedDate && settings && (
        <DayPanel
          dateStr={selectedDate}
          settings={settings}
          staffList={unitStaff}
          requirements={requirements[selectedDate] ?? null}
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

      {showSettings && settings && (
        <RosterSettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={async (input) => {
            const r = await saveRosterSettings(unit, input);
            if (r.success && r.data) { setSettings(r.data); setShowSettings(false); showMsg('설정이 저장되었습니다'); }
            else showMsg(`오류: ${r.error}`);
          }}
        />
      )}
    </div>
  );
}

// ── 날짜 상세 패널 ────────────────────────────────────────────────────────────

function DayPanel({
  dateStr, settings, staffList, requirements,
  getAssigned, getRequired, getWeeklyDayCount, onAdd, onRemove, onTimeChange,
  onRequirementChange, onRequirementReset, onClose,
}: {
  dateStr: string;
  settings: RosterSettings;
  staffList: StaffProfile[];
  requirements: RosterRequirement | null;
  getAssigned: (d: string, s: Shift) => RosterAssignment[];
  getRequired: (d: string, s: Shift) => number;
  getWeeklyDayCount: (staffId: number, d: string) => number;
  onAdd: (d: string, s: Shift, staffId: number) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
  onTimeChange: (id: number, start: string | null, end: string | null) => Promise<void>;
  onRequirementChange: (d: string, am: number, pm: number) => Promise<void>;
  onRequirementReset: (d: string) => Promise<void>;
  onClose: () => void;
}) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');

  // 배정 후보: 불합격/퇴사 제외
  const selectableStaff = staffList.filter(s => s.status === 'confirmed' || s.status === 'candidate');

  const amRequired = getRequired(dateStr, 'AM');
  const pmRequired = getRequired(dateStr, 'PM');

  return (
    <div className="w-full lg:w-[340px] shrink-0 bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
      <div className="flex items-center justify-between mb-3">
        <h3 className="m-0 text-[15px] font-extrabold">
          {Number(dateStr.slice(5, 7))}월 {Number(dateStr.slice(8))}일
          <span className={`ml-1 ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>({DAY_NAMES[day]})</span>
        </h3>
        <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-lg cursor-pointer leading-none hover:text-ink transition">×</button>
      </div>

      {/* 필요 인원 조정 */}
      <div className="bg-canvas-soft rounded-lg p-2.5 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-ink-muted">이 날 필요 인원</span>
          {requirements && (
            <button
              onClick={() => onRequirementReset(dateStr)}
              className="text-[10px] text-primary-600 font-bold bg-transparent border-none cursor-pointer hover:text-primary-800 transition"
            >
              기본값으로
            </button>
          )}
        </div>
        <div className="flex gap-3">
          {SHIFTS.map(shift => {
            const value = shift === 'AM' ? amRequired : pmRequired;
            return (
              <div key={shift} className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-muted">{shift === 'AM' ? '오전' : '오후'}</span>
                <button
                  onClick={() => onRequirementChange(dateStr, shift === 'AM' ? Math.max(0, amRequired - 1) : amRequired, shift === 'PM' ? Math.max(0, pmRequired - 1) : pmRequired)}
                  className="w-5 h-5 rounded bg-canvas border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  −
                </button>
                <span className="text-[13px] font-bold w-4 text-center">{value}</span>
                <button
                  onClick={() => onRequirementChange(dateStr, shift === 'AM' ? amRequired + 1 : amRequired, shift === 'PM' ? pmRequired + 1 : pmRequired)}
                  className="w-5 h-5 rounded bg-canvas border border-hairline cursor-pointer text-[11px] font-bold text-ink-muted hover:border-primary-400 transition leading-none"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 파트별 배정 */}
      {SHIFTS.map(shift => {
        const assigned = getAssigned(dateStr, shift);
        const required = getRequired(dateStr, shift);
        const defaultTime = shift === 'AM' ? `${settings.am_start}~${settings.am_end}` : `${settings.pm_start}~${settings.pm_end}`;
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
          <div key={shift} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[12px] font-extrabold ${shift === 'AM' ? 'text-orange-600' : 'text-indigo-600'}`}>
                {shift === 'AM' ? '오전' : '오후'} <span className="text-ink-faint font-semibold">{defaultTime}</span>
              </span>
              <span className={`text-[11px] font-bold ${assigned.length >= required ? 'text-emerald-600' : 'text-rose-500'}`}>
                {assigned.length}/{required}
              </span>
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
                          setEditStart(a.start_time ?? (shift === 'AM' ? settings.am_start : settings.pm_start));
                          setEditEnd(a.end_time ?? (shift === 'AM' ? settings.am_end : settings.pm_end));
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
                onChange={e => { if (e.target.value) onAdd(dateStr, shift, Number(e.target.value)); }}
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
