import type { StaffRole, StaffStatus } from '@/types/database';

export { DAY_NAMES, checkStaffAvailability } from '@/lib/staffing';

// 파트 순서에 따라 순환하는 강조색
const SHIFT_TEXT_COLORS = ['text-orange-600', 'text-indigo-600', 'text-emerald-600', 'text-rose-500', 'text-cyan-600'] as const;
export function shiftTextColor(index: number): string {
  return SHIFT_TEXT_COLORS[index % SHIFT_TEXT_COLORS.length];
}

// shiftTextColor와 짝을 이루는 옅은 배경 — 주간 매트릭스에서 파트별 칸을 텍스트 색만으로 구분하기 어려워 추가
const SHIFT_BG_COLORS = ['bg-orange-50', 'bg-indigo-50', 'bg-emerald-50', 'bg-rose-50/70', 'bg-cyan-50'] as const;
export function shiftBgColor(index: number): string {
  return SHIFT_BG_COLORS[index % SHIFT_BG_COLORS.length];
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  kitchen: '주방',
  cashier: '캐셔',
};

export const STATUS_LABELS: Record<StaffStatus, string> = {
  candidate: '후보',
  confirmed: '확정',
  inactive: '퇴사',
};

export const STATUS_COLORS: Record<StaffStatus, { bg: string; text: string; border: string }> = {
  candidate: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' },
};
