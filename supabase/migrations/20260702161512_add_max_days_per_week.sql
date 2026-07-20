-- 주 최대 근무일 (null = 무제한). 자동 배정 시 주 단위(일~토)로 초과 배정을 막는다.
alter table public.staff_profiles add column max_days_per_week int
  check (max_days_per_week is null or (max_days_per_week between 1 and 7));
