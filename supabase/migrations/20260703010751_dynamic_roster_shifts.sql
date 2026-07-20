-- 파트를 고정(오전/오후) → 단위별 자유 목록으로 전환
create table public.roster_shifts (
  id bigint generated always as identity primary key,
  staff_role text not null check (staff_role in ('kitchen', 'cashier')),
  store_id bigint references public.stores(id) on delete cascade,
  name text not null,
  start_time text not null default '09:00',
  end_time text not null default '18:00',
  weekday_required int not null default 2,
  weekend_required int not null default 2,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint roster_shifts_unit_check
    check ((staff_role = 'kitchen' and store_id is null) or (staff_role = 'cashier' and store_id is not null))
);
create index roster_shifts_unit_idx on public.roster_shifts (staff_role, store_id);
alter table public.roster_shifts enable row level security;

-- 기존 단위별 설정(오전/오후)을 파트 2개로 이관
insert into public.roster_shifts (staff_role, store_id, name, start_time, end_time, weekday_required, weekend_required, sort_order)
select staff_role, store_id, '오전', am_start, am_end, weekday_am_required, weekend_am_required, 0 from public.roster_settings
union all
select staff_role, store_id, '오후', pm_start, pm_end, weekday_pm_required, weekend_pm_required, 1 from public.roster_settings;

-- 배정: shift 텍스트 → shift_id 참조
alter table public.roster_assignments add column shift_id bigint references public.roster_shifts(id) on delete cascade;
update public.roster_assignments a set shift_id = s.id
from public.roster_shifts s
where s.staff_role = a.staff_role
  and coalesce(s.store_id, 0) = coalesce(a.store_id, 0)
  and s.name = case a.shift when 'AM' then '오전' else '오후' end;
delete from public.roster_assignments where shift_id is null; -- 설정 없던 단위의 고아 배정 정리
alter table public.roster_assignments alter column shift_id set not null;
alter table public.roster_assignments drop constraint roster_assignments_work_date_shift_staff_id_key;
alter table public.roster_assignments drop constraint roster_assignments_shift_check;
alter table public.roster_assignments drop column shift;
alter table public.roster_assignments add constraint roster_assignments_unique unique (work_date, shift_id, staff_id);

-- 날짜별 필요 인원: (날짜, 단위)의 오전/오후 컬럼 → (날짜, 파트) 행
create table public.roster_shift_requirements (
  id bigint generated always as identity primary key,
  work_date date not null,
  shift_id bigint not null references public.roster_shifts(id) on delete cascade,
  required int not null,
  unique (work_date, shift_id)
);
alter table public.roster_shift_requirements enable row level security;

insert into public.roster_shift_requirements (work_date, shift_id, required)
select r.work_date, s.id, r.am_required
from public.roster_requirements r
join public.roster_shifts s on s.staff_role = r.staff_role and coalesce(s.store_id, 0) = coalesce(r.store_id, 0) and s.name = '오전'
union all
select r.work_date, s.id, r.pm_required
from public.roster_requirements r
join public.roster_shifts s on s.staff_role = r.staff_role and coalesce(s.store_id, 0) = coalesce(r.store_id, 0) and s.name = '오후';

drop table public.roster_requirements;
drop table public.roster_settings;

-- 직원 선호 파트: AM/PM/ANY 3택 → 파트 다중 선택 (빈 배열 = 무관)
alter table public.staff_profiles add column preferred_shift_ids bigint[] not null default '{}';
update public.staff_profiles p set preferred_shift_ids = coalesce(
  (select array_agg(s.id) from public.roster_shifts s
   where s.staff_role = p.staff_role
     and coalesce(s.store_id, 0) = coalesce(p.store_id, 0)
     and s.name = case p.preferred_shift when 'AM' then '오전' when 'PM' then '오후' end),
  '{}'
) where p.preferred_shift in ('AM', 'PM');
alter table public.staff_profiles drop column preferred_shift;
