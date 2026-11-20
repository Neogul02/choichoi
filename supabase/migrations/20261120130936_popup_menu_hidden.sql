-- 팝업별 판매 메뉴: 그 팝업에서 팔지 않는 메뉴만 기록한다(행이 없으면 판매). 새 메뉴는 모든 팝업에 자동으로 보인다.
create table if not exists public.popup_menu_hidden (
  popup_id     bigint not null references public.popup_events(id) on delete cascade,
  menu_item_id bigint not null references public.menu_items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (popup_id, menu_item_id)
);
create index if not exists popup_menu_hidden_menu_item_idx on public.popup_menu_hidden (menu_item_id);
-- 서버(service role)만 읽고 쓴다 — 다른 업무 테이블과 같은 deny-all
alter table public.popup_menu_hidden enable row level security;
