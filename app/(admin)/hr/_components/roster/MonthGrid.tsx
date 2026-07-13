'use client';

import { useState } from 'react';
import type { RosterShift, RosterAssignment } from '@/types/database';
import { DAY_NAMES } from '../constants';

interface Props {
  /** 달력 셀 날짜 목록 — null은 빈 칸 (주 시작 패딩 등) */
  gridDates: (string | null)[];
  todayStr: string;
  selectedDate: string | null;
  shifts: RosterShift[];
  /** 규칙 위반이 있는 날짜 집합 */
  violationDates: Set<string>;
  getAssigned: (dateStr: string, shiftId: number) => RosterAssignment[];
  getRequired: (dateStr: string, shift: RosterShift) => number;
  onSelectDate: (dateStr: string | null) => void;
  /** 직원 드롭 — 활성 파트 판정과 배정은 부모가 처리 (파트가 여럿이면 팝오버) */
  onDropStaff: (dateStr: string, staffId: number, x: number, y: number) => void;
}

/** 월 뷰 달력 그리드 — 날짜 선택과 직원 드래그앤드롭 수용 */
export default function MonthGrid({
  gridDates, todayStr, selectedDate, shifts, violationDates, getAssigned, getRequired, onSelectDate, onDropStaff,
}: Props) {
  // 드래그오버 강조는 순수 시각 상태라 그리드 내부에서만 관리
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  return (
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
            onClick={() => onSelectDate(isSelected ? null : dateStr)}
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
              onDropStaff(dateStr, staffId, e.clientX, e.clientY);
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
  );
}
