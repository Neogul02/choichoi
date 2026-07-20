-- 매장 목록 (캐셔 배속용)
create table public.stores (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.stores enable row level security;

-- 직원 구분: 주방 / 캐셔(매장 배속)
alter table public.staff_profiles add column staff_role text not null default 'kitchen'
  check (staff_role in ('kitchen', 'cashier'));
alter table public.staff_profiles add column store_id bigint references public.stores(id) on delete set null;

-- 스케줄 단위(unit) = 주방 전체 또는 캐셔의 특정 매장
-- roster_settings: 싱글톤 → 단위별 행으로 재구성 (기존 행은 주방 단위로 이관)
create table public.roster_settings_new (
  id bigint generated always as identity primary key,
  staff_role text not null check (staff_role in ('kitchen', 'cashier')),
  store_id bigint references public.stores(id) on delete cascade,
  am_start text not null default '06:00',
  am_end text not null default '15:00',
  pm_start text not null default '15:00',
  pm_end text not null default '22:00',
  weekday_am_required int not null default 2,
  weekday_pm_required int not null default 2,
  weekend_am_required int not null default 2,
  weekend_pm_required int not null default 2,
  updated_at timestamptz not null default now(),
  constraint roster_settings_unit_check
    check ((staff_role = 'kitchen' and store_id is null) or (staff_role = 'cashier' and store_id is not null))
);
create unique index roster_settings_unit_uq on public.roster_settings_new (staff_role, coalesce(store_id, 0));

insert into public.roster_settings_new
  (staff_role, store_id, am_start, am_end, pm_start, pm_end,
   weekday_am_required, weekday_pm_required, weekend_am_required, weekend_pm_required, updated_at)
select 'kitchen', null, am_start, am_end, pm_start, pm_end,
       weekday_am_required, weekday_pm_required, weekend_am_required, weekend_pm_required, updated_at
from public.roster_settings;

drop table public.roster_settings;
alter table public.roster_settings_new rename to roster_settings;
alter table public.roster_settings enable row level security;

-- roster_requirements: 날짜 단독 pk → (날짜, 단위)
create table public.roster_requirements_new (
  id bigint generated always as identity primary key,
  work_date date not null,
  staff_role text not null check (staff_role in ('kitchen', 'cashier')),
  store_id bigint references public.stores(id) on delete cascade,
  am_required int not null,
  pm_required int not null,
  constraint roster_requirements_unit_check
    check ((staff_role = 'kitchen' and store_id is null) or (staff_role = 'cashier' and store_id is not null))
);
create unique index roster_requirements_unit_uq on public.roster_requirements_new (work_date, staff_role, coalesce(store_id, 0));

insert into public.roster_requirements_new (work_date, staff_role, store_id, am_required, pm_required)
select work_date, 'kitchen', null, am_required, pm_required from public.roster_requirements;

drop table public.roster_requirements;
alter table public.roster_requirements_new rename to roster_requirements;
alter table public.roster_requirements enable row level security;

-- roster_assignments: 배정이 속한 단위를 기록 (기존 배정은 주방으로 이관)
alter table public.roster_assignments add column staff_role text not null default 'kitchen'
  check (staff_role in ('kitchen', 'cashier'));
alter table public.roster_assignments add column store_id bigint references public.stores(id) on delete cascade;
alter table public.roster_assignments add constraint roster_assignments_unit_check
  check ((staff_role = 'kitchen' and store_id is null) or (staff_role = 'cashier' and store_id is not null));
