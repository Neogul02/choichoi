create table public.manual_daily_menu_sales (
  id bigint generated always as identity primary key,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  sale_date date not null,
  menu_item_id bigint not null references public.menu_items(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (popup_id, sale_date, menu_item_id)
);

alter table public.manual_daily_menu_sales enable row level security;

create index manual_daily_menu_sales_popup_date_idx
  on public.manual_daily_menu_sales (popup_id, sale_date);

create table public.manual_hourly_sales (
  id bigint generated always as identity primary key,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  hour smallint not null check (hour >= 0 and hour <= 23),
  total_revenue bigint not null default 0 check (total_revenue >= 0),
  total_orders integer not null default 0 check (total_orders >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (popup_id, hour)
);

alter table public.manual_hourly_sales enable row level security;
