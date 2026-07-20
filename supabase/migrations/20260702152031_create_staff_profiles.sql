-- 인사관리(HR) 직원/면접자 프로필 — 면접 단계에서는 계정(user_profiles)이 없을 수 있어
-- user_profile_id는 선택적 연결로 둔다.
create table public.staff_profiles (
  id bigint generated always as identity primary key,
  name text not null,
  phone text,
  preferred_shift text not null default 'ANY' check (preferred_shift in ('AM', 'PM', 'ANY')),
  preferred_days int[] not null default '{}',            -- 0=일 ~ 6=토, 빈 배열 = 요일 무관
  available_ranges jsonb not null default '[]'::jsonb,   -- [{"from":"2026-07-15","to":"2026-07-30"}]
  has_health_cert boolean not null default false,
  wants_insurance boolean not null default true,          -- false = 4대보험 미가입(풀 급여) 희망
  hourly_rate int,
  status text not null default 'candidate' check (status in ('candidate', 'trial', 'confirmed', 'rejected', 'inactive')),
  notes text,
  user_profile_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_profiles_status_idx on public.staff_profiles (status);

alter table public.staff_profiles enable row level security;
