import type { StaffProfile } from '@/types/database';

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

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
