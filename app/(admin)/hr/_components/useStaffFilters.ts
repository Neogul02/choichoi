'use client';

import { useMemo, useState } from 'react';
import { phoneMatches } from '@/lib/phone';
import type { StaffProfile, StaffStatus, StaffRole, RosterShift } from '@/types/database';

// 상태는 확정(active)/퇴사(inactive) 두 가지만 관리한다 — 레거시 'candidate'는 확정으로 함께 집계
export type StatusFilter = StaffStatus | 'all' | 'active';
export const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'active', label: '확정' },
  { key: 'inactive', label: '퇴사' },
  { key: 'all', label: '전체' },
];
export type RoleFilter = StaffRole | 'all';
export type SortKey = 'name' | 'status' | 'shifts';
export type SortDir = 'asc' | 'desc';

const STATUS_SORT_ORDER: Record<string, number> = { candidate: 0, confirmed: 0, inactive: 1 };

/**
 * 직원 목록의 역할·상태·검색 필터와 컬럼 정렬 상태 + 필터링 결과를 관리하는 훅.
 * 팝업 범위는 이 훅 밖(HrPageClient의 PopupFilterPicker)에서 미리 좁힌 목록을 받는다 —
 * 예전에는 여기서도 캐셔 전용 storeFilter로 팝업을 한 번 더 걸러 선택지가 둘로 보였다.
 */
export function useStaffFilters(staffList: StaffProfile[], allShifts: RosterShift[]) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  // 기본값은 확정(재직중)만 — 퇴사 처리된 인원은 '퇴사'나 '전체'를 눌러야 보이게
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');

  // 컬럼 정렬
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const roleStaff = useMemo(
    () => roleFilter === 'all' ? staffList : staffList.filter(s => s.staff_role === roleFilter),
    [staffList, roleFilter],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: roleStaff.length, active: 0, candidate: 0, confirmed: 0, inactive: 0 };
    for (const s of roleStaff) counts[s.status]++;
    counts.active = counts.candidate + counts.confirmed;
    return counts;
  }, [roleStaff]);

  const filtered = useMemo(() => {
    let list = roleStaff.filter(s => {
      if (statusFilter === 'active' ? s.status === 'inactive' : statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search.trim() && !s.name.includes(search.trim()) && !phoneMatches(s.phone, search)) return false;
      return true;
    });
    if (sortKey) {
      list = [...list].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') {
          cmp = a.name.localeCompare(b.name, 'ko');
        } else if (sortKey === 'status') {
          cmp = (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9);
        } else if (sortKey === 'shifts') {
          const aS = a.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name ?? '').join(',');
          const bS = b.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)?.name ?? '').join(',');
          cmp = aS.localeCompare(bS, 'ko');
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [roleStaff, statusFilter, search, sortKey, sortDir, allShifts]);

  return {
    roleFilter, setRoleFilter,
    statusFilter, setStatusFilter,
    search, setSearch,
    sortKey, sortDir, handleSort,
    roleStaff, statusCounts, filtered,
  };
}
