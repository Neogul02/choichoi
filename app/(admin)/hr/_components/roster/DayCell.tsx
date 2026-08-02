'use client';

import { memo, useState } from 'react';
import type { RosterShift, RosterAssignment } from '@/types/database';

interface Props {
  dateStr: string;
  dayNum: number;
  day: number;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  hasViolation: boolean;
  shifts: RosterShift[];
  getAssigned: (dateStr: string, shiftId: number) => RosterAssignment[];
  getRequired: (dateStr: string, shift: RosterShift) => number;
  onSelectDate: (dateStr: string | null) => void;
  onDropStaff: (dateStr: string, staffId: number, x: number, y: number) => void;
}

/** 달력 셀 하나 — memo로 감싸 날짜 선택·팝오버 등 무관한 부모 상태 변화에 재렌더되지 않게 한다 */
function DayCell({
  dateStr, dayNum, day, isToday, isSelected, isPast, hasViolation, shifts, getAssigned, getRequired, onSelectDate, onDropStaff,
}: Props) {
  // 드래그오버 강조는 순수 시각 상태라 셀 내부에서만 관리
  const [dragOver, setDragOver] = useState(false);

  return (
    <button
      onClick={() => onSelectDate(isSelected ? null : dateStr)}
      onDragOver={e => {
        if (!isPast && e.dataTransfer.types.includes('application/staff-id')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (isPast) return;
        const staffId = parseInt(e.dataTransfer.getData('application/staff-id'));
        if (isNaN(staffId)) return;
        onDropStaff(dateStr, staffId, e.clientX, e.clientY);
      }}
      className={`flex flex-col gap-0.5 items-stretch rounded-lg border p-1 md:p-1.5 min-h-[64px] cursor-pointer transition text-left bg-canvas ${
        dragOver && !isPast
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
        {hasViolation && (
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
}

export default memo(DayCell);
