-- staff_popup_assignments_unique(staff_id, popup_id)의 선두 컬럼과 완전 중복
drop index if exists public.idx_staff_popup_assignments_staff_id;

-- orders_popup_created_idx(popup_id, created_at)가 선두 컬럼으로 대체 (EXPLAIN 채택 확인)
drop index if exists public.idx_orders_popup_id;

-- 스캔 0회 — 11행 테이블이라 플래너가 사용하지 않음. 파트 수가 커지면 재추가
drop index if exists public.roster_shifts_unit_idx;
