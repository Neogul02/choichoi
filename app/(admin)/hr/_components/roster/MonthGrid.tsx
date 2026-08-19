'use client';

import { memo } from 'react';
import type { RosterShift, RosterAssignment } from '@/types/database';
import { DAY_NAMES } from '../constants';
import DayCell from './DayCell';

interface Props {
  /** 달력 셀 날짜 목록 — null은 빈 칸 (주 시작 패딩 등) */
  gridDates: (string | null)[];
  todayStr: string;
  selectedDate: string | null;
  shifts: RosterShift[];
  getAssigned: (dateStr: string, shiftId: number) => RosterAssignment[];
  /** 규칙 위반이 있는 날짜 집합 */
  violationDates: Set<string>;
  onSelectDate: (dateStr: string | null) => void;
  /** 직원 드롭 — 활성 파트 판정과 배정은 부모가 처리 (파트가 여럿이면 팝오버) */
  onDropStaff: (dateStr: string, staffId: number, x: number, y: number) => void;
}

/**
 * 월 뷰 달력 그리드 — 날짜 선택과 직원 드래그앤드롭 수용.
 * memo + 셀 단위(DayCell) memo 이중 경계 — 부모(RosterCalendar)의 dropTarget·confirmAction 등
 * 그리드와 무관한 상태 변화가 35~42개 셀 전체를 다시 그리지 않도록 한다.
 */
function MonthGrid({
  gridDates, todayStr, selectedDate, shifts, getAssigned, violationDates, onSelectDate, onDropStaff,
}: Props) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((d, i) => (
        <div key={d} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>
          {d}
        </div>
      ))}
      {gridDates.map((dateStr, i) => {
        if (!dateStr) return <div key={`empty-${i}`} />;
        return (
          <DayCell
            key={dateStr}
            dateStr={dateStr}
            dayNum={Number(dateStr.slice(8))}
            day={i % 7}
            isToday={dateStr === todayStr}
            isSelected={dateStr === selectedDate}
            isPast={dateStr < todayStr}
            hasViolation={violationDates.has(dateStr)}
            shifts={shifts}
            getAssigned={getAssigned}
            onSelectDate={onSelectDate}
            onDropStaff={onDropStaff}
          />
        );
      })}
    </div>
  );
}

export default memo(MonthGrid);
