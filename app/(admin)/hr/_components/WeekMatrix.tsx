'use client';

import { useMemo } from 'react';
import type { RosterAssignment, RosterShift, StaffProfile } from '@/types/database';
import { DAY_NAMES, shiftTextColor } from './constants';
import { addDays } from '@/lib/date';

interface Props {
  weekStart: string; // 일요일 (YYYY-MM-DD)
  todayStr: string;
  shifts: RosterShift[];
  staffList: StaffProfile[];
  getAssigned: (dateStr: string, shiftId: number) => RosterAssignment[];
  getRequired: (dateStr: string, shift: RosterShift) => number;
  /** 배정 id → 규칙 위반 사유 목록 */
  violations: Map<number, string[]>;
  selectedDate: string | null;
  onDateClick: (dateStr: string) => void;
}

export default function WeekMatrix({
  weekStart, todayStr, shifts, staffList, getAssigned, getRequired, violations, selectedDate, onDateClick,
}: Props) {
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  // shift_id → { shift, 색상 인덱스 }
  const shiftInfoById = useMemo(() => new Map(shifts.map((s, i) => [s.id, { shift: s, idx: i }])), [shifts]);

  // staff_id → date → 그날 배정 목록
  const byStaff = useMemo(() => {
    const map = new Map<number, Map<string, RosterAssignment[]>>();
    for (const dateStr of dates) {
      for (const shift of shifts) {
        for (const a of getAssigned(dateStr, shift.id)) {
          let dayMap = map.get(a.staff_id);
          if (!dayMap) { dayMap = new Map(); map.set(a.staff_id, dayMap); }
          const bucket = dayMap.get(dateStr);
          if (bucket) bucket.push(a); else dayMap.set(dateStr, [a]);
        }
      }
    }
    return map;
  }, [dates, shifts, getAssigned]);

  // 행 순서: 좌측 직원 목록 순서 유지, 목록에 없는 배정자(이적 등)는 뒤에 추가
  const rows = useMemo(() => {
    const listed = staffList.filter(s => byStaff.has(s.id)).map(s => ({ id: s.id, name: s.name }));
    const listedIds = new Set(listed.map(r => r.id));
    const extras: { id: number; name: string }[] = [];
    for (const [staffId, dayMap] of byStaff) {
      if (listedIds.has(staffId)) continue;
      const first = [...dayMap.values()][0]?.[0];
      extras.push({ id: staffId, name: first?.staff_profiles?.name ?? `#${staffId}` });
    }
    return [...listed, ...extras];
  }, [staffList, byStaff]);

  const idleStaff = staffList.filter(s => !byStaff.has(s.id) && s.status === 'confirmed');

  const dayHeaderColor = (i: number) => (i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-ink-muted');

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] grid gap-px bg-hairline rounded-lg overflow-hidden border border-hairline" style={{ gridTemplateColumns: 'minmax(76px, auto) repeat(7, minmax(0, 1fr)) 44px' }}>
        {/* ── 헤더: 날짜 ── */}
        {/* 첫 열은 sticky — 모바일 가로 스크롤 시 이름·라벨이 왼쪽에 고정 (불투명 배경 + 우측 1px 그림자로 경계 유지) */}
        <div className="sticky left-0 z-10 bg-canvas-soft px-2 py-1.5 shadow-[1px_0_0_var(--color-hairline)]" />
        {dates.map((dateStr, i) => {
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={`px-1 py-1.5 text-center cursor-pointer border-none transition ${
                isSelected ? 'bg-primary-50' : 'bg-canvas-soft hover:bg-primary-50/60'
              }`}
            >
              <span className={`block text-[10px] font-bold leading-none ${dayHeaderColor(i)}`}>{DAY_NAMES[i]}</span>
              <span className={`mt-0.5 inline-flex items-center justify-center text-[11px] font-bold leading-none ${
                isToday ? 'text-white bg-primary-700 rounded-full w-[18px] h-[18px]' : 'text-ink'
              }`}>
                {Number(dateStr.slice(8))}
              </span>
            </button>
          );
        })}
        <div className="bg-canvas-soft px-1 py-1.5 text-center text-[10px] font-bold text-ink-muted flex items-center justify-center">일수</div>

        {/* ── 충원 현황 행 ── */}
        <div className="sticky left-0 z-10 bg-canvas px-2 py-1 text-[10px] font-semibold text-ink-faint flex items-center shadow-[1px_0_0_var(--color-hairline)]">충원</div>
        {dates.map(dateStr => (
          <div key={`fill-${dateStr}`} className="bg-canvas px-0.5 py-1 flex flex-col gap-0.5 items-stretch">
            {shifts.map(shift => {
              const required = getRequired(dateStr, shift);
              const filled = getAssigned(dateStr, shift.id).length;
              if (required === 0 && filled === 0) return null;
              const full = filled >= required;
              return (
                <span
                  key={shift.id}
                  className={`text-[9px] font-bold rounded px-1 py-0.5 leading-none truncate text-center ${
                    full ? 'bg-emerald-50 text-emerald-700' : filled === 0 ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {shift.name} {filled}/{required}
                </span>
              );
            })}
          </div>
        ))}
        <div className="bg-canvas" />

        {/* ── 근무자 행 ── */}
        {rows.map(row => {
          const dayMap = byStaff.get(row.id);
          const workDays = dayMap?.size ?? 0;
          return (
            <div key={row.id} className="contents">
              <div className="sticky left-0 z-10 bg-canvas px-2 py-1.5 flex items-center min-w-0 shadow-[1px_0_0_var(--color-hairline)]">
                <span className="text-[12px] font-bold text-ink truncate">{row.name}</span>
              </div>
              {dates.map(dateStr => {
                const cellAssigns = dayMap?.get(dateStr) ?? [];
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={dateStr}
                    onClick={() => onDateClick(dateStr)}
                    className={`px-0.5 py-1 min-h-[44px] md:min-h-[34px] flex flex-col gap-0.5 items-stretch justify-center cursor-pointer border-none transition ${
                      isSelected ? 'bg-primary-50/70' : 'bg-canvas hover:bg-primary-50/40'
                    }`}
                  >
                    {cellAssigns.map(a => {
                      const info = shiftInfoById.get(a.shift_id);
                      const reasons = violations.get(a.id);
                      return (
                        <span
                          key={a.id}
                          title={reasons?.join(', ')}
                          className={`text-[10px] font-bold rounded px-1 py-0.5 leading-none truncate text-center ${
                            reasons ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-canvas-soft'
                          } ${shiftTextColor(info?.idx ?? 0)}`}
                        >
                          {reasons && '⚠️'}
                          {info?.shift.name ?? '?'}
                          {a.start_time && <span className="ml-0.5 font-semibold opacity-70">{a.start_time.slice(0, 5)}</span>}
                        </span>
                      );
                    })}
                  </button>
                );
              })}
              <div className="bg-canvas px-1 py-1.5 flex items-center justify-center">
                <span className="text-[11px] font-bold text-ink-muted">{workDays}</span>
              </div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <p className="text-center text-[12px] text-ink-faint mt-4 mb-2">이번 주 배정된 근무자가 없습니다.</p>
      )}
      {idleStaff.length > 0 && (
        <p className="m-0 mt-2 text-[11px] text-ink-faint">
          이번 주 배정 없음: {idleStaff.map(s => s.name).join(', ')}
        </p>
      )}
    </div>
  );
}
