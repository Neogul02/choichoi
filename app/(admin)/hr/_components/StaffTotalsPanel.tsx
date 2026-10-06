'use client';

import { useMemo } from 'react';
import type { RosterAssignment, RosterShift, StaffProfile } from '@/types/database';
import { paidMinutes, minutesToHours } from '@/lib/workhours';

interface Props {
  staffList: StaffProfile[];
  shifts: RosterShift[];
  /** 화면에 보이는 기간으로 이미 필터된 배정 목록 */
  assignments: RosterAssignment[];
  isLoading: boolean;
}

/** 화면에 보이는 기간 기준 인원별 근무일 수·총 시간(휴게 제외) 합계 */
export default function StaffTotalsPanel({ staffList, shifts, assignments, isLoading }: Props) {
  const totals = useMemo(() => {
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const acc = new Map<number, { days: Set<string>; minutes: number }>();
    for (const a of assignments) {
      // 파트 행을 못 찾아도(비활성 팝업·삭제된 파트) 근무 사실은 유효하다 — 예전에는 continue로 건너뛰어
      // 합계에서 그 사람의 시간이 조용히 사라졌다. 시간·휴게는 배정 행에 확정 기록돼 있다.
      const shift = shiftById.get(a.shift_id);
      const start = a.start_time ?? shift?.start_time;
      const end = a.end_time ?? shift?.end_time;
      if (!start || !end) continue;
      const mins = paidMinutes(start, end, a.break_minutes, shift?.break_minutes);
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
      .map(([id, e]) => ({ id, name: nameOf(id), days: e.days.size, hours: minutesToHours(e.minutes) }))
      .sort((a, b) => b.days - a.days || b.hours - a.hours || a.name.localeCompare(b.name, 'ko'));
  }, [assignments, shifts, staffList]);

  if (isLoading || totals.length === 0) return null;

  return (
    <div className="mt-3 border border-hairline rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-canvas-soft border-b border-hairline">
        <span className="text-[12px] font-bold text-ink-muted">인원별 합계</span>
        <span className="text-[11px] text-ink-faint">화면에 보이는 기간 기준 · 휴게시간 제외</span>
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
