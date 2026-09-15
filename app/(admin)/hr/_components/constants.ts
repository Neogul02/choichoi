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

// 인사 탭에서 실제로 관리하는 상태는 '확정'과 '퇴사' 두 가지뿐이다.
// 'candidate'(후보)는 폐지된 레거시 값 — DB에 남은 행은 확정과 동일하게 취급해 보여준다.
export const MANAGED_STATUSES: StaffStatus[] = ['confirmed', 'inactive'];

/** 레거시 'candidate'를 확정으로 접어 실제 관리 상태로 정규화 */
export function normalizeStatus(status: StaffStatus): StaffStatus {
  return status === 'candidate' ? 'confirmed' : status;
}

export const STATUS_LABELS: Record<StaffStatus, string> = {
  candidate: '확정',
  confirmed: '확정',
  inactive: '퇴사',
};

const CONFIRMED_COLOR = { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };

export const STATUS_COLORS: Record<StaffStatus, { bg: string; text: string; border: string }> = {
  candidate: CONFIRMED_COLOR,
  confirmed: CONFIRMED_COLOR,
  inactive: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200' },
};
