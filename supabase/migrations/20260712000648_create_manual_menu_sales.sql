create table public.manual_menu_sales (
  id bigint generated always as identity primary key,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  menu_item_id bigint not null references public.menu_items(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (popup_id, menu_item_id)
);

alter table public.manual_menu_sales enable row level security;
