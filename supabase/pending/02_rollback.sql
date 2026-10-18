-- 02_sales_rollups.sql 되돌리기. 03을 적용했다면 03_rollback.sql을 먼저 실행한다
-- (get_lifetime_sales_totals가 sales_daily를 읽고 있으면 테이블을 지울 때 함수가 깨진다).
drop trigger if exists orders_rollup_ins on public.orders;
drop trigger if exists orders_rollup_upd on public.orders;
drop trigger if exists orders_rollup_del on public.orders;
drop trigger if exists order_items_rollup_ins on public.order_items;
drop trigger if exists order_items_rollup_upd on public.order_items;
drop trigger if exists order_items_rollup_del on public.order_items;
drop function if exists public._orders_rollup();
drop function if exists public._order_items_rollup();
drop function if exists public._rollup_order(date, bigint, numeric, bigint);
drop function if exists public._rollup_item(date, bigint, bigint, bigint, numeric);
drop table if exists public.menu_sales_daily;
drop table if exists public.sales_daily;
