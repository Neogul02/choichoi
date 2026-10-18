-- 04 적용 "후"에 실행. 결과 세 값이 모두 0이어야 한다. 0이 아니면 런북 중단 기준대로 04_rollback.sql.
-- 확인이 끝나면 맨 아래 drop 두 줄을 따로 실행해 기준선을 지운다(불일치가 있으면 조사용으로 남긴다).
with cur as (
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
  from m group by staff_id, ym
), cur_rows as (
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
         md5(concat_ws('|', staff_id, work_date, assignment_id, clock_in_at, clock_out_at, break_minutes, status)) from public.attendance_records
), minute_diff as (
  (select staff_id, ym, paid_minutes, shifts from ops_backup.payroll_baseline_minutes
   except select staff_id, ym, paid_minutes, shifts from cur)
  union all
  (select staff_id, ym, paid_minutes, shifts from cur
   except select staff_id, ym, paid_minutes, shifts from ops_backup.payroll_baseline_minutes)
), row_diff as (
  (select src, k, h from ops_backup.payroll_baseline_rows except select src, k, h from cur_rows)
  union all
  (select src, k, h from cur_rows except select src, k, h from ops_backup.payroll_baseline_rows)
)
select (select count(*) from minute_diff) as minute_mismatch,
       (select count(*) from row_diff) as raw_row_mismatch,
       (select coalesce(sum(paid_minutes), 0) from cur) - (select coalesce(sum(paid_minutes), 0) from ops_backup.payroll_baseline_minutes) as total_paid_minutes_delta;

-- 확인 후:
-- drop table ops_backup.payroll_baseline_minutes;
-- drop table ops_backup.payroll_baseline_rows;
