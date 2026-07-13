'use client';

import { useMemo, useState } from 'react';
import type { StaffProfile, StaffStatus, StaffRole, RosterShift } from '@/types/database';

export type StatusFilter = StaffStatus | 'all';
export type StoreFilter = number | 'all' | 'none';
export type RoleFilter = StaffRole | 'all';
export type SortKey = 'name' | 'status' | 'shifts' | 'available';
export type SortDir = 'asc' | 'desc';

const STATUS_SORT_ORDER: Record<string, number> = { candidate: 0, confirmed: 1, rejected: 2, inactive: 3 };

/** 직원 목록의 역할·매장·상태·검색 필터와 컬럼 정렬 상태 + 필터링 결과를 관리하는 훅 */
export function useStaffFilters(staffList: StaffProfile[], allShifts: RosterShift[]) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [storeFilter, setStoreFilter] = useState<StoreFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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
    const counts: Record<StatusFilter, number> = { all: roleStaff.length, candidate: 0, confirmed: 0, rejected: 0, inactive: 0 };
    for (const s of roleStaff) counts[s.status]++;
    return counts;
  }, [roleStaff]);

  const filtered = useMemo(() => {
    let list = roleStaff.filter(s => {
      if (roleFilter === 'cashier' && storeFilter !== 'all') {
        if (storeFilter === 'none' ? s.store_id !== null : s.store_id !== storeFilter) return false;
      }
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search.trim() && !s.name.includes(search.trim()) && !(s.phone ?? '').includes(search.trim())) return false;
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
        } else if (sortKey === 'available') {
          const aD = a.available_ranges[0]?.from ?? '9999';
          const bD = b.available_ranges[0]?.from ?? '9999';
          cmp = aD.localeCompare(bD);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [roleStaff, roleFilter, storeFilter, statusFilter, search, sortKey, sortDir, allShifts]);

  return {
    roleFilter, setRoleFilter,
    storeFilter, setStoreFilter,
    statusFilter, setStatusFilter,
    search, setSearch,
    sortKey, sortDir, handleSort,
    roleStaff, statusCounts, filtered,
  };
}
