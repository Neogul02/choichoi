-- getTodaysSales(app/actions/orders.ts)가 결제 완료마다 당일 주문 전체 행을 select('total_price')로
-- 끌어와 JS에서 reduce하던 것을 DB 집계로 대체 — get_orders_daily_totals와 동일 패턴.
-- 체크아웃 응답 경로에서 매번 호출되는 만큼 행 수에 비례해 커지던 payload를 단일 행으로 고정한다.
create or replace function public.get_todays_sales_totals(
  p_start timestamptz,
  p_end timestamptz,
  p_popup_id integer default null
)
returns table(total_revenue numeric, total_orders bigint)
language sql
stable
set search_path to 'public'
as $$
  select
    coalesce(sum(total_price), 0)::numeric as total_revenue,
    count(*)::bigint                       as total_orders
  from orders
  where
    created_at >= p_start
    and created_at <= p_end
    and (p_popup_id is null or popup_id = p_popup_id);
$$;
