-- 관리자 2차 코드(ADMIN_LOGIN_CODE) 시도 횟수 제한. 코드 확인 서버 액션(checkAdminLoginCode)에 횟수 제한이 없어,
-- 관리자 비밀번호를 아는 사람이 코드를 무제한으로 대입할 수 있었다(코드는 짧은 숫자일 가능성이 높다).
-- 계정별로 연속 실패를 세고 5회면 15분 잠근다. 서버리스라 메모리 카운터는 인스턴스마다 따로라 DB에 둔다.
-- service role(서버 액션)만 읽고 쓴다.
create table public.admin_code_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_code_attempts enable row level security;
