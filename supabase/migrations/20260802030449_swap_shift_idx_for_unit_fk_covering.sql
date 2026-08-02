-- 복합 FK(shift_id, staff_role, popup_id) 커버링 인덱스 — 파트 삭제 cascade 조회 커버
-- 기존 단일 shift_id 인덱스는 새 복합 인덱스의 선두 컬럼으로 대체되므로 제거 (순증 0)
create index if not exists roster_assignments_shift_unit_idx
  on public.roster_assignments (shift_id, staff_role, popup_id);

drop index if exists public.idx_roster_assignments_shift_id;
