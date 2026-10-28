-- 직원별 기본 공제 방식 — 프리랜서(사업소득)는 원천징수 3.3%, 단기 근로자는 고용보험 0.9%처럼
-- 사람마다 정해져 있는데 매달 급여 상세를 열어 같은 버튼을 다시 눌러야 했다.
-- 급여정산의 '기본 공제 일괄 적용'이 이 값으로 그 달 조정 항목(payroll_adjustments)을 만든다.
-- NULL = 정하지 않음. 값은 lib/payroll-deductions.ts DEFAULT_DEDUCTIONS 키와 같다.
alter table public.staff_profiles
  add column if not exists default_deduction text
  constraint staff_profiles_default_deduction_check
    check (default_deduction is null or default_deduction in ('withholding33', 'employment_insurance'));
