-- 1. popup_id 컬럼 추가 (백필을 위해 우선 nullable)
alter table public.staff_profiles add column popup_id bigint references public.popup_events(id) on delete set null;
alter table public.roster_shifts add column popup_id bigint references public.popup_events(id) on delete cascade;
alter table public.roster_assignments add column popup_id bigint references public.popup_events(id) on delete cascade;

-- 2. 백필 — 기존 popup_events.store_id 연결을 이용해 1:1로 정확히 옮긴다 (주방 행은 store_id가 원래 null이라 자동으로 popup_id도 null 유지)
update public.staff_profiles sp set popup_id = pe.id from public.popup_events pe where pe.store_id = sp.store_id;
update public.roster_shifts rs set popup_id = pe.id from public.popup_events pe where pe.store_id = rs.store_id;
update public.roster_assignments ra set popup_id = pe.id from public.popup_events pe where pe.store_id = ra.store_id;

-- 3. 체크 제약 교체 (store_id → popup_id, 의미 동일)
alter table public.roster_shifts drop constraint roster_shifts_unit_check;
alter table public.roster_shifts add constraint roster_shifts_unit_check
  check ((staff_role = 'kitchen' and popup_id is null) or (staff_role = 'cashier' and popup_id is not null));
alter table public.roster_assignments drop constraint roster_assignments_unit_check;
alter table public.roster_assignments add constraint roster_assignments_unit_check
  check ((staff_role = 'kitchen' and popup_id is null) or (staff_role = 'cashier' and popup_id is not null));

-- 4. 인덱스 교체
drop index if exists public.roster_shifts_unit_idx;
create index roster_shifts_unit_idx on public.roster_shifts (staff_role, popup_id);
drop index if exists public.idx_roster_assignments_store_id;
create index idx_roster_assignments_popup_id on public.roster_assignments (popup_id);
drop index if exists public.idx_staff_profiles_store_id;
create index idx_staff_profiles_popup_id on public.staff_profiles (popup_id);
drop index if exists public.idx_popup_events_store_id;

-- 5. 옛 컬럼 제거
alter table public.staff_profiles drop column store_id;
alter table public.roster_shifts drop column store_id;
alter table public.roster_assignments drop column store_id;
alter table public.popup_events drop column store_id;

-- 6. stores 테이블 제거
drop table public.stores;
