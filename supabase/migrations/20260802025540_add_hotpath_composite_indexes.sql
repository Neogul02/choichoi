-- POS 금일 주문 조회: popup_id 필터 + created_at 범위가 항상 함께 쓰인다 (기존엔 단일 인덱스 2개로 분리)
create index if not exists orders_popup_created_idx on public.orders (popup_id, created_at);

-- 로스터 단위 조회: applyUnitFilter(staff_role, popup_id) + work_date 범위가 핫패스
create index if not exists roster_assignments_unit_date_idx on public.roster_assignments (staff_role, popup_id, work_date);
