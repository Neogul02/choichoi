-- 재고탭 비주얼 보관함(냉장고 등 오브젝트) 배치/드래그드롭 + 재료 연결

create table if not exists public.storage_objects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'box' check (icon in ('fridge', 'freezer', 'shelf', 'box', 'other')),
  pos_x numeric(5,2) not null default 50 check (pos_x >= 0 and pos_x <= 100),
  pos_y numeric(5,2) not null default 50 check (pos_y >= 0 and pos_y <= 100),
  sort_order int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_storage_objects_updated_at on public.storage_objects;
create trigger set_storage_objects_updated_at
  before update on public.storage_objects
  for each row execute function public.set_updated_at();

create table if not exists public.storage_object_items (
  id bigint generated always as identity primary key,
  object_id uuid not null references public.storage_objects(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (object_id, ingredient_id)
);

create index if not exists storage_object_items_ingredient_id_idx
  on public.storage_object_items (ingredient_id);

alter table public.storage_objects enable row level security;
alter table public.storage_object_items enable row level security;

-- authenticated SELECT 허용: 재고탭은 로그인한 모든 직원(user 포함)이 조회 가능,
-- 실시간 postgres_changes 구독도 이 정책을 통해 동작한다. 쓰기는 서버 액션의
-- service role(supabase-admin)로만 수행하므로 INSERT/UPDATE/DELETE 정책은 추가하지 않는다.
create policy "authenticated_read_storage_objects" on public.storage_objects
  for select to authenticated using (true);

create policy "authenticated_read_storage_object_items" on public.storage_object_items
  for select to authenticated using (true);
