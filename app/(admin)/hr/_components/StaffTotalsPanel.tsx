'use client';

import { useMemo } from 'react';
import type { RosterAssignment, RosterShift, StaffProfile } from '@/types/database';
import { toMinutes } from '@/lib/staffing';

interface Props {
  staffList: StaffProfile[];
  shifts: RosterShift[];
  /** 표시 범위로 이미 필터된 배정 목록 */
  assignments: RosterAssignment[];
  isLoading: boolean;
}

/** 표시 범위 기준 인원별 근무일 수·총 시간(휴게 제외) 합계 */
export default function StaffTotalsPanel({ staffList, shifts, assignments, isLoading }: Props) {
  const totals = useMemo(() => {
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const acc = new Map<number, { days: Set<string>; minutes: number }>();
    for (const a of assignments) {
      const shift = shiftById.get(a.shift_id);
      if (!shift) continue;
      let mins = toMinutes(a.end_time ?? shift.end_time) - toMinutes(a.start_time ?? shift.start_time);
      if (mins < 0) mins += 24 * 60; // 자정 넘김
      mins = Math.max(0, mins - shift.break_minutes);
      let entry = acc.get(a.staff_id);
      if (!entry) { entry = { days: new Set(), minutes: 0 }; acc.set(a.staff_id, entry); }
      entry.days.add(a.work_date);
      entry.minutes += mins;
    }
    const nameOf = (id: number) =>
      staffList.find(s => s.id === id)?.name
      ?? assignments.find(a => a.staff_id === id)?.staff_profiles?.name
      ?? `#${id}`;
    return [...acc.entries()]
      .map(([id, e]) => ({ id, name: nameOf(id), days: e.days.size, hours: Math.round(e.minutes / 6) / 10 }))
      .sort((a, b) => b.days - a.days || b.hours - a.hours || a.name.localeCompare(b.name, 'ko'));
  }, [assignments, shifts, staffList]);

  if (isLoading || totals.length === 0) return null;

  return (
    <div className="mt-3 border border-hairline rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-canvas-soft border-b border-hairline">
        <span className="text-[12px] font-bold text-ink-muted">인원별 합계</span>
        <span className="text-[11px] text-ink-faint">표시 범위 기준 · 휴게시간 제외</span>
      </div>
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {totals.map((t, i) => (
            <tr key={t.id} className={i !== totals.length - 1 ? 'border-b border-hairline' : ''}>
              <td className="px-3 py-1.5 font-bold text-ink truncate max-w-[120px]">{t.name}</td>
              <td className="px-2 py-1.5 text-ink-muted whitespace-nowrap w-[64px] text-right">{t.days}일</td>
              <td className="px-3 py-1.5 text-ink-muted whitespace-nowrap w-[88px] text-right">{t.hours}시간</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
