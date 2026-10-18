-- 누적 합계(get_lifetime_sales_totals)가 통계탭을 열 때마다 orders·order_items 전체를 훑던 문제.
--
-- 실측 276ms(주문 1.1만 건)이고 주문이 쌓이는 만큼 선형으로 느려진다. 통계 페이지 첫 응답이 이 조회를
-- 기다렸다(코드에선 Suspense로 분리했지만 조회 자체는 그대로 무겁다). 사업장이 늘면 그대로 곱해진다.
--
-- 그래서 (날짜, 팝업) 단위 POS 합계와 (날짜, 팝업, 메뉴) 단위 판매 수량을 주문이 쓰일 때 같이 갱신해 둔다.
-- 규칙:
--   - 날짜는 기존 RPC들과 같은 KST 영업일: (orders.created_at + 9h)::date  (created_at은 시간대 없는 UTC 값)
--   - popup_id NULL 주문은 기존 RPC들처럼 -1로 묶는다(popup_key). FULL JOIN 키에 NULL이 끼면 행이 떨어진다.
--   - 주문 건수가 0이 된 (날짜, 팝업) 행은 지운다. 남겨 두면 누적 합계의 영업일 수(day_count)가 늘어난다.
--   - 수동 정정(daily_sales·popup_daily_sales·manual_*)은 여기 섞지 않는다. 정정 우선순위는 지금처럼 RPC가 정한다.
--
-- 쓰기 경로(app/actions/orders.ts): orders insert → order_items insert, 삭제는 order_items 먼저 지우고 orders,
-- 실패 정리는 orders delete(→ order_items cascade). 갱신은 is_prepared만. 그래도 total_price·popup_id·created_at
-- 변경과 cascade 삭제까지 맞게 처리한다 — 트리거가 한 번이라도 어긋나면 누적 숫자가 조용히 틀린다.

-- 남아 있는 긴 트랜잭션 때문에 잠금을 못 얻으면 그 뒤의 결제가 전부 이 마이그레이션 뒤에 줄 선다 — 5초면 포기한다.
set local lock_timeout = '5s';

create table public.sales_daily (
  sale_date  date    not null,
  popup_key  bigint  not null,            -- coalesce(orders.popup_id, -1)
  revenue    numeric not null default 0,
  orders     bigint  not null default 0,
  primary key (sale_date, popup_key)
);

create table public.menu_sales_daily (
  sale_date    date    not null,
  popup_key    bigint  not null,
  menu_item_id bigint  not null,
  quantity     bigint  not null default 0,
  revenue      numeric not null default 0,
  primary key (sale_date, popup_key, menu_item_id)
);

alter table public.sales_daily enable row level security;
alter table public.menu_sales_daily enable row level security;

-- ── 갱신 헬퍼 ────────────────────────────────────────────────────────────────

create or replace function public._rollup_order(p_date date, p_popup bigint, p_revenue numeric, p_orders bigint)
returns void language plpgsql set search_path to 'public' as $$
begin
  insert into sales_daily as s (sale_date, popup_key, revenue, orders)
  values (p_date, p_popup, p_revenue, p_orders)
  on conflict (sale_date, popup_key)
  do update set revenue = s.revenue + excluded.revenue, orders = s.orders + excluded.orders;
  delete from sales_daily where sale_date = p_date and popup_key = p_popup and orders <= 0;
end $$;

create or replace function public._rollup_item(p_date date, p_popup bigint, p_menu bigint, p_qty bigint, p_revenue numeric)
returns void language plpgsql set search_path to 'public' as $$
begin
  insert into menu_sales_daily as m (sale_date, popup_key, menu_item_id, quantity, revenue)
  values (p_date, p_popup, p_menu, p_qty, p_revenue)
  on conflict (sale_date, popup_key, menu_item_id)
  do update set quantity = m.quantity + excluded.quantity, revenue = m.revenue + excluded.revenue;
  delete from menu_sales_daily
   where sale_date = p_date and popup_key = p_popup and menu_item_id = p_menu and quantity = 0 and revenue = 0;
end $$;

-- 트리거 전용 헬퍼 — PostgREST RPC로 노출하지 않는다
revoke execute on function public._rollup_order(date, bigint, numeric, bigint) from public, anon, authenticated;
revoke execute on function public._rollup_item(date, bigint, bigint, bigint, numeric) from public, anon, authenticated;

-- ── orders ───────────────────────────────────────────────────────────────────

create or replace function public._orders_rollup()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  it record;
begin
  if tg_op = 'INSERT' then
    perform _rollup_order((new.created_at + interval '9 hours')::date, coalesce(new.popup_id, -1), new.total_price, 1);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (new.created_at + interval '9 hours')::date is distinct from (old.created_at + interval '9 hours')::date
       or coalesce(new.popup_id, -1) <> coalesce(old.popup_id, -1)
       or new.total_price is distinct from old.total_price then
      perform _rollup_order((old.created_at + interval '9 hours')::date, coalesce(old.popup_id, -1), -old.total_price, -1);
      perform _rollup_order((new.created_at + interval '9 hours')::date, coalesce(new.popup_id, -1), new.total_price, 1);
      -- 날짜·팝업이 바뀌면 이미 집계된 품목도 옮긴다
      if (new.created_at + interval '9 hours')::date is distinct from (old.created_at + interval '9 hours')::date
         or coalesce(new.popup_id, -1) <> coalesce(old.popup_id, -1) then
        for it in select menu_item_id, quantity, subtotal from order_items where order_id = new.id loop
          perform _rollup_item((old.created_at + interval '9 hours')::date, coalesce(old.popup_id, -1), it.menu_item_id, -it.quantity, -it.subtotal);
          perform _rollup_item((new.created_at + interval '9 hours')::date, coalesce(new.popup_id, -1), it.menu_item_id, it.quantity, it.subtotal);
        end loop;
      end if;
    end if;
    return new;
  end if;

  -- DELETE (BEFORE): 품목이 아직 있을 때 같이 뺀다. cascade로 지워지는 품목의 트리거는 주문을 못 찾아 건너뛴다.
  perform _rollup_order((old.created_at + interval '9 hours')::date, coalesce(old.popup_id, -1), -old.total_price, -1);
  for it in select menu_item_id, quantity, subtotal from order_items where order_id = old.id loop
    perform _rollup_item((old.created_at + interval '9 hours')::date, coalesce(old.popup_id, -1), it.menu_item_id, -it.quantity, -it.subtotal);
  end loop;
  return old;
end $$;

revoke execute on function public._orders_rollup() from public, anon, authenticated;

create trigger orders_rollup_ins after insert on public.orders
  for each row execute function public._orders_rollup();
create trigger orders_rollup_upd after update of total_price, popup_id, created_at on public.orders
  for each row execute function public._orders_rollup();
create trigger orders_rollup_del before delete on public.orders
  for each row execute function public._orders_rollup();

-- ── order_items ──────────────────────────────────────────────────────────────

create or replace function public._order_items_rollup()
returns trigger language plpgsql set search_path to 'public' as $$
-- 레코드 변수 대신 스칼라를 쓴다: PL/pgSQL은 AND를 단락 평가하지 않아, INSERT에서 할당 안 된
-- 레코드의 필드(o_old.d)를 읽으면 "record is not assigned yet"로 결제(품목 insert)가 통째로 실패한다
-- (PGlite 검증에서 실제로 걸렸다).
declare
  new_d date; new_pk bigint;
  old_d date; old_pk bigint;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select (created_at + interval '9 hours')::date, coalesce(popup_id, -1) into new_d, new_pk from orders where id = new.order_id;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    select (created_at + interval '9 hours')::date, coalesce(popup_id, -1) into old_d, old_pk from orders where id = old.order_id;
    -- 주문을 못 찾으면(cascade 삭제 중) 주문 BEFORE DELETE 트리거가 이미 뺐다
    if old_d is not null then
      perform _rollup_item(old_d, old_pk, old.menu_item_id, -old.quantity, -old.subtotal);
    end if;
  end if;
  if new_d is not null then
    perform _rollup_item(new_d, new_pk, new.menu_item_id, new.quantity, new.subtotal);
  end if;
  return null;
end $$;

revoke execute on function public._order_items_rollup() from public, anon, authenticated;

create trigger order_items_rollup_ins after insert on public.order_items
  for each row execute function public._order_items_rollup();
create trigger order_items_rollup_upd after update of order_id, menu_item_id, quantity, subtotal on public.order_items
  for each row execute function public._order_items_rollup();
create trigger order_items_rollup_del after delete on public.order_items
  for each row execute function public._order_items_rollup();

-- ── 백필 ─────────────────────────────────────────────────────────────────────
-- 트리거를 건 뒤에 채운다(같은 트랜잭션). 적용 중 들어온 주문이 백필과 트리거에 이중으로 잡히지 않도록
-- 런북대로 영업 종료 후에 적용하고, 적용 트랜잭션 동안 orders·order_items를 잠근다.

lock table public.orders, public.order_items in share row exclusive mode;

insert into public.sales_daily (sale_date, popup_key, revenue, orders)
select (created_at + interval '9 hours')::date, coalesce(popup_id, -1), sum(total_price), count(*)
from public.orders
group by 1, 2;

insert into public.menu_sales_daily (sale_date, popup_key, menu_item_id, quantity, revenue)
select (o.created_at + interval '9 hours')::date, coalesce(o.popup_id, -1), oi.menu_item_id, sum(oi.quantity), sum(oi.subtotal)
from public.order_items oi
join public.orders o on o.id = oi.order_id
group by 1, 2, 3
having sum(oi.quantity) <> 0 or sum(oi.subtotal) <> 0;
