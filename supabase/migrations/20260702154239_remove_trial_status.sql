-- 맛보기(trial) 상태 제거 — 후보(candidate)로 통합
update public.staff_profiles set status = 'candidate' where status = 'trial';
alter table public.staff_profiles drop constraint staff_profiles_status_check;
alter table public.staff_profiles add constraint staff_profiles_status_check
  check (status in ('candidate', 'confirmed', 'rejected', 'inactive'));
