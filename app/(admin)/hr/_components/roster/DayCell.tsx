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
  /** 그날 그 파트에 필요한 인원 — 0이면 운영하지 않는 파트 */
  getRequired: (dateStr: string, shift: RosterShift) => number;
  /** 캐셔 "전체" 보기에서 서로 다른 팝업의 동명 파트를 구분하기 위한 표시 이름 — 기본은 shift.name */
  getShiftLabel: (shift: RosterShift) => string;
  /** 그날 운영 중인 팝업을 칸 배경에 옅게 까는 CSS 그라데이션 (팝업 이름은 달력 위 범례로 안내) */
  tint?: string;
  onSelectDate: (dateStr: string | null) => void;
  onDropStaff: (dateStr: string, staffId: number, x: number, y: number) => void;
}

/** 달력 셀 하나 — memo로 감싸 날짜 선택·팝오버 등 무관한 부모 상태 변화에 재렌더되지 않게 한다 */
function DayCell({
  dateStr, dayNum, day, isToday, isSelected, isPast, hasViolation, shifts, getAssigned, getRequired, getShiftLabel, tint, onSelectDate, onDropStaff,
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
      style={dragOver && !isPast ? undefined : { backgroundImage: tint }}
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
        const assigned = getAssigned(dateStr, shift.id);
        const required = getRequired(dateStr, shift);
        // 배정도 없고 그날 운영하지도 않는 파트만 숨긴다 — 나머지는 항상 자리를 차지해
        // 어느 날 어느 파트가 비어 있는지 달력만 봐도 보이게 한다
        if (assigned.length === 0 && required === 0) return null;

        if (assigned.length === 0) {
          return (
            <span
              key={shift.id}
              title={`${getShiftLabel(shift)} 미배정 (0/${required}명)`}
              className="text-[9px] md:text-[10px] font-semibold rounded px-1 py-0.5 leading-none truncate border border-dashed border-hairline text-ink-faint"
            >
              {getShiftLabel(shift)} 0/{required}
            </span>
          );
        }

        const names = assigned.map(a => a.staff_profiles?.name).filter((n): n is string => !!n);
        const short = required > 0 && assigned.length < required;
        return (
          <span
            key={shift.id}
            title={`${names.length > 0 ? names.join(', ') : `${assigned.length}명`}${required > 0 ? ` (${assigned.length}/${required}명)` : ''}`}
            // 배정된 사람은 전원 이름이 보여야 한다 — 예전에는 "홍길동 외 2" 식으로 줄여서
            // 누가 나오는 날인지 달력만 보고는 알 수 없었다. 줄바꿈을 허용해 칸이 늘어나게 둔다.
            // break-keep: 한국어 이름이 글자 단위로 쪼개지지 않게 (이름 사이에서만 줄바꿈)
            className="text-[9px] md:text-[10px] font-bold rounded px-1 py-0.5 leading-snug whitespace-normal break-keep bg-canvas-soft text-ink-muted text-left"
          >
            <span className="text-ink-faint">{getShiftLabel(shift)}</span>
            {names.length > 0 ? ` ${names.join(', ')}` : ` ${assigned.length}명`}
            {short && <span className="ml-0.5 text-amber-600">{assigned.length}/{required}</span>}
          </span>
        );
      })}
    </button>
  );
}

export default memo(DayCell);
