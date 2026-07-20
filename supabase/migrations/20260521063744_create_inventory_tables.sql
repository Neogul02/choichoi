
-- 재료 마스터
create table if not exists ingredients (
  id               text primary key,
  name             text not null,
  category         text not null,
  color            text not null,
  unit_type        text not null check (unit_type in ('count','weight')),
  base_unit        text not null,
  container_unit   text not null,
  container_size   numeric not null,
  sealed_count     integer not null default 0,
  opened_remaining numeric not null default 0,
  reorder_at_containers integer not null default 1,
  vendor           text,
  lead_days        integer,
  unit_price       integer,
  sort_order       integer default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- 레시피 (메뉴 × 재료)
create table if not exists recipes (
  menu_id        integer not null references menu_items(id) on delete cascade,
  ingredient_id  text not null references ingredients(id) on delete restrict,
  qty_per_unit   numeric not null,
  primary key (menu_id, ingredient_id)
);

-- 입고 로그
create table if not exists restock_events (
  id            bigserial primary key,
  ingredient_id text not null references ingredients(id) on delete restrict,
  sealed_delta  integer not null default 0,
  opened_delta  numeric not null default 0,
  note          text,
  created_by    text,
  created_at    timestamptz default now()
);

-- 차감 로그
create table if not exists deduction_events (
  id            bigserial primary key,
  order_id      integer references orders(id) on delete set null,
  ingredient_id text not null references ingredients(id) on delete restrict,
  qty_deducted  numeric not null,
  created_at    timestamptz default now()
);

-- updated_at 트리거
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ingredients_updated_at
  before update on ingredients
  for each row execute function set_updated_at();
