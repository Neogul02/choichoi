-- 02 적용 직후 + 다음 영업일 마감 후 한 번 더 실행한다. 두 값 모두 0이어야 한다.
-- 원본(orders·order_items)을 그 자리에서 다시 집계해 집계 테이블과 행 단위로 맞댄다(양방향 차집합).
with src as (
  select (created_at + interval '9 hours')::date as sale_date, coalesce(popup_id, -1) as popup_key,
         sum(total_price) as revenue, count(*)::bigint as orders
  from public.orders group by 1, 2
), d as (
  (select * from src except select sale_date, popup_key, revenue, orders from public.sales_daily)
  union all
  (select sale_date, popup_key, revenue, orders from public.sales_daily except select * from src)
), src_m as (
  select (o.created_at + interval '9 hours')::date as sale_date, coalesce(o.popup_id, -1) as popup_key,
         oi.menu_item_id, sum(oi.quantity)::bigint as quantity, sum(oi.subtotal) as revenue
  from public.order_items oi join public.orders o on o.id = oi.order_id
  group by 1, 2, 3 having sum(oi.quantity) <> 0 or sum(oi.subtotal) <> 0
), dm as (
  (select * from src_m except select sale_date, popup_key, menu_item_id, quantity, revenue from public.menu_sales_daily)
  union all
  (select sale_date, popup_key, menu_item_id, quantity, revenue from public.menu_sales_daily except select * from src_m)
)
select (select count(*) from d) as sales_daily_mismatch,
       (select count(*) from dm) as menu_sales_daily_mismatch;
