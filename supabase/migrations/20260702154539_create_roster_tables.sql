-- 파트 시간대 + 기본 필요 인원 (싱글톤 설정)
create table public.roster_settings (
  id int primary key default 1 check (id = 1),
  am_start text not null default '06:00',
  am_end text not null default '15:00',
  pm_start text not null default '15:00',
  pm_end text not null default '22:00',
  weekday_am_required int not null default 2,
  weekday_pm_required int not null default 2,
  weekend_am_required int not null default 2,
  weekend_pm_required int not null default 2,
  updated_at timestamptz not null default now()
);
insert into public.roster_settings (id) values (1);

-- 날짜별 필요 인원 예외 (없으면 settings 기본값 사용)
create table public.roster_requirements (
  work_date date primary key,
  am_required int not null,
  pm_required int not null
);

-- 근무 배정
create table public.roster_assignments (
  id bigint generated always as identity primary key,
  work_date date not null,
  shift text not null check (shift in ('AM', 'PM')),
  staff_id bigint not null references public.staff_profiles(id) on delete cascade,
  start_time text,  -- null이면 settings의 파트 기본 시간 사용
  end_time text,
  created_at timestamptz not null default now(),
  unique (work_date, shift, staff_id)
);
create index roster_assignments_date_idx on public.roster_assignments (work_date);

alter table public.roster_settings enable row level security;
alter table public.roster_requirements enable row level security;
alter table public.roster_assignments enable row level security;
