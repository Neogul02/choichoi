-- 팝업 휴무일(백화점 정기휴점 등) — 운영 기간 안이지만 영업하지 않는 날.
--
-- 왜 필요한가: 백화점 팝업은 기간 중에도 정기휴점일이 있다(분당 AK는 매주 월요일).
-- 기간(start_date~end_date)만으로는 이 날을 표현할 수 없어서, 일괄 배정으로 기간 전체를
-- 채운 뒤 휴점일만 손으로 지우고 있었다. 지우는 걸 잊으면 근무표·일정표에 그날 근무자가
-- 나오고, 요구 인원이 살아 있어 미충원(빨간색)으로도 표시된다.
--
-- 왜 요일 반복이 아니라 날짜 행인가: "매주 월요일 휴점"이 흔하지만 임시 휴점·명절 휴점처럼
-- 요일로 표현 안 되는 날도 섞인다. 반대로 휴점일에 특별 영업을 하는 예외도 있다.
-- 요일 규칙과 날짜 예외를 함께 두면 "이 날이 휴무인가"를 두 곳에서 판정해야 하므로,
-- 저장은 날짜 행 하나로만 하고 "매주 ○요일 일괄 지정"은 UI에서 기간에 펼쳐 넣는다.
-- 날짜 행이 있으면 휴무, 없으면 영업 — 판정이 한 곳이다.
--
-- 급여와의 관계: 휴무일 지정은 급여를 바꾸지 않는다. 근무 사실은 roster_assignments 행에
-- 있고 휴무일은 보조값이다. 이미 배정이 찍힌 날을 휴무로 지정해도 배정은 남으며,
-- 삭제는 화면에서 건수를 보여준 뒤 관리자가 따로 확인해야 수행된다.
create table if not exists public.popup_closed_days (
  id bigint generated always as identity primary key,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  closed_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (popup_id, closed_date)
);

-- (popup_id, closed_date) unique 인덱스가 "그 팝업의 기간 내 휴무일" 조회를 그대로 커버한다.

alter table public.popup_closed_days enable row level security;

-- 근무표·일정표는 로그인한 직원이 보는 화면이라 SELECT는 authenticated 전체에 허용한다.
-- 쓰기는 서버 액션의 service role로만 하므로 INSERT/UPDATE/DELETE 정책은 두지 않는다.
create policy "authenticated_read_popup_closed_days" on public.popup_closed_days
  for select to authenticated using (true);
