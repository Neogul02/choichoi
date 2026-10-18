-- Supabase 성능 점검(unindexed_foreign_keys)이 짚은 외래키 두 개에 인덱스가 없어,
-- 참조 대상(roster_assignments 행, auth.users 행)을 지우거나 갱신할 때 참조하는 쪽을 순차 스캔한다.
-- 지금은 행이 적어 체감이 없지만 출근 기록·지급 기록은 매일 쌓이고 사업장이 늘면 곱해진다.
-- attendance_records_assignment_fkey는 (assignment_id, staff_id) 복합 키라 단일 컬럼 인덱스로는 덮이지 않는다.

create index if not exists attendance_records_assignment_staff_idx
  on public.attendance_records (assignment_id, staff_id);

create index if not exists payroll_payments_paid_by_idx
  on public.payroll_payments (paid_by);
