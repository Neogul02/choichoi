-- roster_assignments의 staff_role·popup_id는 성능을 위한 의도적 복사본(applyUnitFilter가 조인 없이 직접 필터).
-- 복사본이 원본(roster_shifts)과 어긋나는 것을 DB 차원에서 차단한다 (사전 검증: 기존 321행 불일치 0건).
-- popup_id가 null인 행(주방)은 MATCH SIMPLE 규칙상 검증에서 제외된다 — 부분 강제.
-- 주의: 단일 컬럼 shift_id FK는 유지해야 한다 — popup_id null 행의 파트 삭제 연쇄는 단일 FK만 보장한다.
create unique index if not exists roster_shifts_id_unit_key
  on public.roster_shifts (id, staff_role, popup_id);

alter table public.roster_assignments
  add constraint roster_assignments_unit_consistency_fkey
  foreign key (shift_id, staff_role, popup_id)
  references public.roster_shifts (id, staff_role, popup_id)
  on update cascade on delete cascade;
