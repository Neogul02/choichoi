import type { StaffRole, StaffStatus } from '@/types/database';

export { DAY_NAMES, checkStaffAvailability } from '@/lib/staffing';

export const ROLE_LABELS: Record<StaffRole, string> = {
  kitchen: '주방',
  cashier: '캐셔',
};

export const STATUS_LABELS: Record<StaffStatus, string> = {
  candidate: '후보',
  confirmed: '확정',
  rejected: '불합격',
  inactive: '퇴사',
};

export const STATUS_COLORS: Record<StaffStatus, { bg: string; text: string; border: string }> = {
  candidate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  rejected: { bg: 'bg-rose-50', text: 'text-rose-500', border: 'border-rose-200' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' },
};

/** [{from:'2026-07-15',to:'2026-07-30'}] → "7/15~7/30, 8/1~8/5" */
export function formatRanges(ranges: { from: string; to: string }[]): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
  };
  return ranges.map(r => (r.from === r.to ? fmt(r.from) : `${fmt(r.from)}~${fmt(r.to)}`)).join(', ');
}
