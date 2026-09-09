-- 급여 지급 완료 표시 — 기존에는 브라우저 localStorage에만 있어 기기를 바꾸면 사라지고
-- 다른 관리자와 공유되지 않았다. period_key는 'month:2026-8' 또는 'popup:12' 형태.
create table public.payroll_payments (
  id bigint generated always as identity primary key,
  period_key text not null,
  staff_id bigint not null references public.staff_profiles(id) on delete cascade,
  paid_at timestamptz not null default now(),
  paid_by uuid references auth.users(id) on delete set null,
  unique (period_key, staff_id)
);
create index payroll_payments_period_idx on public.payroll_payments (period_key);
create index payroll_payments_staff_id_idx on public.payroll_payments (staff_id);

-- 급여 조정 항목(식대·교통비·공제 등) — 기존에는 모달을 닫으면 사라져 매달 다시 입력해야 했다
create table public.payroll_adjustments (
  id bigint generated always as identity primary key,
  period_key text not null,
  staff_id bigint not null references public.staff_profiles(id) on delete cascade,
  label text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);
create index payroll_adjustments_period_staff_idx on public.payroll_adjustments (period_key, staff_id);
create index payroll_adjustments_staff_id_idx on public.payroll_adjustments (staff_id);

-- 자주 쓰는 조정 항목 프리셋 — 매번 항목명·금액을 다시 치지 않도록
create table public.payroll_adjustment_presets (
  id bigint generated always as identity primary key,
  label text not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  unique (label, amount)
);

alter table public.payroll_payments enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_adjustment_presets enable row level security;

-- 서비스 롤(서버 액션)은 RLS를 우회한다. 접근은 전부 서버 액션의 requireManagerOrAdmin을 거치므로
-- authenticated에게는 정책을 열지 않는다 (다른 인사 테이블과 동일한 방식).
