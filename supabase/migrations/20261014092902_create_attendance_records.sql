-- 주방 출근부(키오스크) — 출퇴근을 실제 시각으로 찍어 근무표 위에 덮어쓴다.
--
-- 왜 필요한가: 주방은 10시 출근이 일정하지만 산도 물량에 따라 퇴근이 매일 달라진다.
-- 근무표(roster_assignments)에는 계획 시간(예: 10:00~18:00)만 있어서, 직원이 실제 퇴근 시각을
-- 수기로 다시 세고 관리자가 한 번 더 대조해 근무표를 고치고 있었다.
--
-- 왜 별도 테이블 + 배정 행 덮어쓰기인가: roster_assignments는 이미 "그 근무일의 확정값"을 담는
-- 자기완결 행이고(20261006082614), 급여·근무표·인원별 합계가 전부 그 행을 lib/workhours.ts로 읽는다.
-- 퇴근 시 실측값을 배정 행에 쓰면 급여 코드를 한 줄도 바꾸지 않고 실측이 반영된다.
-- attendance_records는 원본 증빙(실제 찍은 시각)과, 덮어쓰기 직전의 계획값(planned_*)을 남긴다 —
-- 지난주 복사가 실측 퇴근 시각(20:37 등)을 다음 주 계획으로 옮기지 않도록 계획값이 필요하다.
--
-- 출근·퇴근은 각각 한 번만: 하루 한 기록(아래 unique 인덱스) + open→closed 단방향 전이.
-- 잘못 누른 기록은 관리자가 무효화(attendance_void)한다.

-- 출퇴근 기록이 가리키는 배정의 직원이 바뀌면(근무 교환) 다른 사람이 그 실측 급여를 받게 된다.
-- (id, staff_id) 복합 FK로 배정 쪽 staff_id 변경과 삭제를 DB에서 막기 위한 대상 키.
alter table public.roster_assignments
  add constraint roster_assignments_id_staff_key unique (id, staff_id);

create table public.attendance_records (
  id bigint generated always as identity primary key,
  -- 근로 증빙이므로 직원 삭제에 딸려 지워지지 않게 restrict
  staff_id bigint not null references public.staff_profiles(id) on delete restrict,
  -- 출근 시각의 KST 날짜. 자정을 넘겨 퇴근해도 근무일은 출근일이다
  work_date date not null,
  assignment_id bigint,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  break_minutes integer,
  planned_start_time text,
  planned_end_time text,
  planned_break_minutes integer,
  -- 근무표에 없던 날 출근해 배정을 자동 생성한 경우 — 관리자 확인 대상
  unscheduled boolean not null default false,
  status text not null default 'open',
  voided_by uuid,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_records_status_check check (status in ('open', 'closed', 'voided')),
  -- 배정 삭제(파트 cascade 포함)·근무 교환을 막는다. 무효화된 기록은 assignment_id를 비워 풀어준다
  constraint attendance_records_assignment_fkey foreign key (assignment_id, staff_id)
    references public.roster_assignments(id, staff_id) on delete restrict on update restrict,
  constraint attendance_records_clock_order check (
    clock_out_at is null or (clock_out_at > clock_in_at and clock_out_at < clock_in_at + interval '24 hours')
  ),
  constraint attendance_records_closed_has_out check (status <> 'closed' or clock_out_at is not null),
  constraint attendance_records_break_range check (break_minutes is null or break_minutes between 0 and 1440)
);

-- 출근 버튼을 두 번 눌러도(동시 탭 포함) 하루 한 기록. 무효화한 기록은 다시 출근할 수 있게 제외
create unique index attendance_records_one_per_day
  on public.attendance_records (staff_id, work_date) where status <> 'voided';
create index attendance_records_assignment_idx on public.attendance_records (assignment_id);
create index attendance_records_work_date_idx on public.attendance_records (work_date);

-- 쓰기·읽기 모두 서버 액션의 service role로만 한다(키오스크 계정에 테이블 권한을 주지 않는다)
alter table public.attendance_records enable row level security;

-- 퇴근 = 계획값 스냅샷 + 배정 행 덮어쓰기 + 기록 마감. supabase-js에는 트랜잭션이 없어서
-- 중간에 끊기면 기록과 급여가 어긋나므로 한 함수로 묶는다. 시각 계산(계획 시작 이전 출근은
-- 계획 시작부터 인정)은 lib/attendance.ts가 하고 여기서는 원자적 기록만 한다.
create or replace function public.attendance_clock_out(
  p_record_id bigint,
  p_clock_out_at timestamptz,
  p_start_time text,
  p_end_time text,
  p_break_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.attendance_records%rowtype;
  a public.roster_assignments%rowtype;
begin
  select * into r from public.attendance_records where id = p_record_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND'; end if;
  if r.status <> 'open' then raise exception 'ATTENDANCE_NOT_OPEN'; end if;

  select * into a from public.roster_assignments where id = r.assignment_id for update;
  if not found then raise exception 'ATTENDANCE_ASSIGNMENT_MISSING'; end if;

  update public.attendance_records
     set clock_out_at = p_clock_out_at,
         break_minutes = p_break_minutes,
         status = 'closed',
         planned_start_time = a.start_time,
         planned_end_time = a.end_time,
         planned_break_minutes = a.break_minutes
   where id = r.id;

  update public.roster_assignments
     set start_time = p_start_time,
         end_time = p_end_time,
         break_minutes = p_break_minutes
   where id = a.id;
end;
$$;

-- 잘못 누른 기록 취소. 퇴근까지 끝난 기록이면 배정을 계획값으로 되돌리고,
-- 미예정 출근으로 자동 생성된 배정은 함께 지운다(그 근무 자체가 잘못 눌린 것이므로).
create or replace function public.attendance_void(p_record_id bigint, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.attendance_records%rowtype;
begin
  select * into r from public.attendance_records where id = p_record_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND'; end if;
  if r.status = 'voided' then raise exception 'ATTENDANCE_ALREADY_VOIDED'; end if;

  update public.attendance_records
     set status = 'voided', assignment_id = null, voided_by = p_user, voided_at = now()
   where id = r.id;

  if r.assignment_id is null then return; end if;

  if r.unscheduled then
    delete from public.roster_assignments where id = r.assignment_id;
  elsif r.status = 'closed' then
    update public.roster_assignments
       set start_time = r.planned_start_time,
           end_time = r.planned_end_time,
           break_minutes = r.planned_break_minutes
     where id = r.assignment_id;
  end if;
end;
$$;

revoke execute on function public.attendance_clock_out(bigint, timestamptz, text, text, integer) from public, anon, authenticated;
revoke execute on function public.attendance_void(bigint, uuid) from public, anon, authenticated;
