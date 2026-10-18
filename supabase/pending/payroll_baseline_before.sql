-- 급여에 닿는 마이그레이션(04) 적용 "전"에 실행. CLAUDE.md: 직원별·월별 유급 분 기준선을 떠두고 적용 후 행 단위 비교.
-- 세션이 바뀌어도 남도록 TEMP가 아닌 ops_backup 스키마의 일반 테이블에 둔다. 비교가 끝나면 지운다(after 파일 끝).
--
-- 유급 분 규칙은 lib/workhours.ts paidMinutes와 같다:
--   실근무 = 종료 − 시작(분), 0 이하이면 +1440(자정 넘김, 같은 시각 = 24시간)
--   휴게   = 배정 break_minutes(NULL이 아니면 0 포함 그대로) > 파트 break_minutes(0은 미설정) > 60
--   시작·종료는 배정 값, NULL이면 파트 값(payroll.ts와 같은 폴백)
create schema if not exists ops_backup;

drop table if exists ops_backup.payroll_baseline_minutes;
create table ops_backup.payroll_baseline_minutes as
with a as (
  select ra.id, ra.staff_id, ra.work_date,
         coalesce(ra.start_time, rs.start_time) as st,
         coalesce(ra.end_time, rs.end_time)     as et,
         coalesce(ra.break_minutes, nullif(rs.break_minutes, 0), 60) as brk
  from public.roster_assignments ra
  left join public.roster_shifts rs on rs.id = ra.shift_id
), m as (
  select staff_id, to_char(work_date, 'YYYY-MM') as ym,
         greatest(0,
           (case when (split_part(et, ':', 1)::int * 60 + split_part(et, ':', 2)::int)
                    - (split_part(st, ':', 1)::int * 60 + split_part(st, ':', 2)::int) <= 0
                 then (split_part(et, ':', 1)::int * 60 + split_part(et, ':', 2)::int)
                    - (split_part(st, ':', 1)::int * 60 + split_part(st, ':', 2)::int) + 1440
                 else (split_part(et, ':', 1)::int * 60 + split_part(et, ':', 2)::int)
                    - (split_part(st, ':', 1)::int * 60 + split_part(st, ':', 2)::int) end) - brk) as paid
  from a
  where st is not null and et is not null
)
select staff_id, ym, sum(paid)::bigint as paid_minutes, count(*)::int as shifts
from m group by staff_id, ym;

-- 금액에 들어가는 원자료도 행 그대로 떠둔다 — 유급 분이 같아도 시급·공제·지급 기록이 바뀌면 돈이 바뀐다.
drop table if exists ops_backup.payroll_baseline_rows;
create table ops_backup.payroll_baseline_rows as
select 'roster_assignments' as src, id::text as k,
       md5(concat_ws('|', staff_id, work_date, start_time, end_time, break_minutes, shift_id, staff_role, popup_id)) as h
  from public.roster_assignments
union all
select 'roster_shifts', id::text, md5(concat_ws('|', start_time, end_time, break_minutes, staff_role, popup_id)) from public.roster_shifts
union all
select 'staff_profiles', id::text, md5(concat_ws('|', hourly_rate, status, staff_role, wants_insurance)) from public.staff_profiles
union all
select 'payroll_payments', id::text, md5(concat_ws('|', period_key, staff_id, paid_at)) from public.payroll_payments
union all
select 'payroll_adjustments', id::text, md5(concat_ws('|', period_key, staff_id, label, amount)) from public.payroll_adjustments
union all
select 'attendance_records', id::text,
       md5(concat_ws('|', staff_id, work_date, assignment_id, clock_in_at, clock_out_at, break_minutes, status)) from public.attendance_records;

select (select count(*) from ops_backup.payroll_baseline_minutes) as minute_rows,
       (select sum(paid_minutes) from ops_backup.payroll_baseline_minutes) as total_paid_minutes,
       (select count(*) from ops_backup.payroll_baseline_rows) as raw_rows;
