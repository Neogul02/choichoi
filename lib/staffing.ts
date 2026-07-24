import type { StaffProfile } from '@/types/database';
import { prevDate, dayOfWeek } from '@/lib/date';

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface ShiftRequirementSource {
  id: number;
  active_from: string | null;
  active_to: string | null;
  weekday_required: number;
  weekend_required: number;
}

/** 파트의 해당 날짜 요구 인원 — 활성 기간 밖이면 0, 날짜별 예외(overrides) 우선, 이후 주말/평일 기본값 */
export function requiredFor(dateStr: string, shift: ShiftRequirementSource, overrides: Record<string, number>): number {
  if (shift.active_from && dateStr < shift.active_from) return 0;
  if (shift.active_to && dateStr > shift.active_to) return 0;
  const override = overrides[`${dateStr}|${shift.id}`];
  if (override !== undefined) return override;
  const day = dayOfWeek(dateStr);
  return day === 0 || day === 6 ? shift.weekend_required : shift.weekday_required;
}

/** 배정 목록 → `${work_date}|${shift_id}` 키 맵 (날짜+파트별 조회용) */
export function buildAssignMap<A extends { work_date: string; shift_id: number }>(assignments: A[]): Map<string, A[]> {
  const map = new Map<string, A[]>();
  for (const a of assignments) {
    const key = `${a.work_date}|${a.shift_id}`;
    const bucket = map.get(key);
    if (bucket) bucket.push(a); else map.set(key, [a]);
  }
  return map;
}

/** 해당 날짜가 속한 주의 시작일(일요일, 달력 표시 기준과 동일) — YYYY-MM-DD */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface ShiftRef {
  id: number;
  name: string;
}

/** 특정 날짜+파트에 근무 가능한지 판정. 조건이 비어 있으면(파트/요일/기간 무관) 가능으로 본다. */
export function checkStaffAvailability(
  staff: StaffProfile,
  dateStr: string, // YYYY-MM-DD
  shift: ShiftRef,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (staff.preferred_shift_ids.length > 0 && !staff.preferred_shift_ids.includes(shift.id)) {
    reasons.push('다른 파트 선호');
  }

  const day = new Date(dateStr + 'T00:00:00').getDay();
  if (staff.preferred_days.length > 0 && !staff.preferred_days.includes(day)) {
    reasons.push(`${DAY_NAMES[day]}요일 비선호`);
  }

  if (staff.available_ranges.length > 0 && !staff.available_ranges.some(r => r.from <= dateStr && dateStr <= r.to)) {
    reasons.push('가용 기간 아님');
  }

  return { ok: reasons.length === 0, reasons };
}

/** 'HH:MM' → 자정 기준 분 */
export const toMinutes = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export const MIN_REST_MINUTES = 9 * 60; // 전일 퇴근 → 당일 출근 최소 휴식

export interface AssignmentForCheck {
  id: number;
  work_date: string; // YYYY-MM-DD
  shift_id: number;
  staff_id: number;
  start_time: string | null; // null이면 파트 기본 시간
  end_time: string | null;
}

/**
 * 저장된 배정 목록에서 근무 규칙 위반을 찾는다 (배정 id → 사유 목록).
 * - 전일 퇴근 후 9시간 미만 휴식
 * - 주(일~토) 최대 근무일 초과 — 해당 주의 그 직원 배정 전체에 표시
 * 전달된 배정 범위 내에서만 판정하므로 범위 밖 인접 주·전일 데이터는 반영되지 않는다.
 */
export function findRosterViolations(
  assignments: AssignmentForCheck[],
  shifts: { id: number; start_time: string; end_time: string }[],
  staffList: Pick<StaffProfile, 'id' | 'max_days_per_week'>[],
): Map<number, string[]> {
  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const maxByStaff = new Map(staffList.map(s => [s.id, s.max_days_per_week]));
  const byStaff = new Map<number, AssignmentForCheck[]>();
  for (const a of assignments) {
    const bucket = byStaff.get(a.staff_id);
    if (bucket) bucket.push(a); else byStaff.set(a.staff_id, [a]);
  }

  const violations = new Map<number, string[]>();
  const add = (id: number, reason: string) => {
    const list = violations.get(id);
    if (list) list.push(reason); else violations.set(id, [reason]);
  };

  for (const [staffId, list] of byStaff) {
    // 날짜별 가장 늦은 퇴근 시각(분)
    const endByDate = new Map<string, number>();
    for (const a of list) {
      const shift = shiftById.get(a.shift_id);
      if (!shift) continue;
      const end = toMinutes(a.end_time ?? shift.end_time);
      const cur = endByDate.get(a.work_date);
      if (cur === undefined || end > cur) endByDate.set(a.work_date, end);
    }

    for (const a of list) {
      const shift = shiftById.get(a.shift_id);
      if (!shift) continue;
      const prevEnd = endByDate.get(prevDate(a.work_date));
      if (prevEnd !== undefined) {
        const start = toMinutes(a.start_time ?? shift.start_time);
        if (start + 24 * 60 - prevEnd < MIN_REST_MINUTES) add(a.id, '전일 퇴근 후 9시간 미만 휴식');
      }
    }

    const max = maxByStaff.get(staffId);
    if (max != null) {
      const daysByWeek = new Map<string, Set<string>>();
      for (const a of list) {
        const ws = getWeekStart(a.work_date);
        const days = daysByWeek.get(ws);
        if (days) days.add(a.work_date); else daysByWeek.set(ws, new Set([a.work_date]));
      }
      for (const [ws, days] of daysByWeek) {
        if (days.size <= max) continue;
        for (const a of list) {
          if (getWeekStart(a.work_date) === ws) add(a.id, `주 최대 ${max}일 초과 (${days.size}일)`);
        }
      }
    }
  }
  return violations;
}
