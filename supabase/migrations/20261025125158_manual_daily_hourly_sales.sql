-- 하루 단위 시간대별 수기 매출. POS를 쓰지 않고 백화점 전산(시간대별 매출표)만 있는 날의 시간대 흐름을 남길 곳이 없었다.
-- manual_hourly_sales는 (팝업, 시각) 키라 팝업 전체 기간의 시간대 값이다 — 하루치를 넣으면 그 팝업 기간 전체의 시간대
-- 그래프가 그날 숫자로 덮인다. 그래서 (팝업, 날짜, 시각) 단위를 따로 둔다. 화면 규칙: 이 표에 행이 있는 날은 그날의 POS
-- 시간대 집계를 대신한다(팝업 통계 시간대 그래프, 통계탭 오늘 현황 곡선). hour는 KST 시각 h시 정각~h시 59분.
-- 시간대별 주문 수는 전산표에 없는 경우가 많아 NULL을 허용한다(하루 주문 수는 popup_daily_sales가 가진다).
create table public.manual_daily_hourly_sales (
  id bigint generated always as identity primary key,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  sale_date date not null,
  hour smallint not null check (hour between 0 and 23),
  total_revenue bigint not null check (total_revenue >= 0),
  total_orders integer check (total_orders >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (popup_id, sale_date, hour)
);

alter table public.manual_daily_hourly_sales enable row level security;
