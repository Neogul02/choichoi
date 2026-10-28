-- 달력 RPC 2개와 누적 합계 RPC가 정정 우선순위를 각자 다시 구현하지 않고 get_popup_day_sales/get_day_sales
-- (20261027 sales_precedence_functions)를 읽게 한다. 매출·주문 결과는 바꾸기 전과 행 단위로 같다(2026-03~11월
-- 날짜 155행·팝업 112행 양방향 차집합 0, 누적 합계 동일). POS 원본도 orders 직접 집계 대신 sales_daily를 읽는다.
--
-- 누적 합계의 산도 개수는 일부러 바꾼다: 날짜별 수기 품목(manual_daily_menu_sales)을 (팝업, 메뉴) 단위로 합쳐
-- 그 팝업의 기간 전체 POS 수량을 통째로 갈아끼우고 있었다. 분당 AK처럼 며칠만 수기로 넣으면 나머지 날 POS 판매가
-- 빠져 62,004개로 2,636개 적게 나왔다. 규칙을 팝업 통계와 같게 고친다:
--   (날짜, 팝업, 메뉴) 하루 = 날짜별 수기 > POS,  (팝업, 메뉴) 전체 = 기간 전체 수기(manual_menu_sales) > 하루들의 합.
create or replace function public.get_monthly_sales_by_date(p_year integer, p_month integer)
 returns table(sale_date text, total_revenue numeric, order_count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select to_char(d.sale_date, 'YYYY-MM-DD'), d.revenue, d.orders
  from get_day_sales(make_date(p_year, p_month, 1), (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date) d
$function$;

create or replace function public.get_monthly_sales_by_date_popup(p_year integer, p_month integer)
 returns table(sale_date text, popup_id bigint, popup_name text, total_revenue numeric, order_count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select to_char(s.sale_date, 'YYYY-MM-DD'), nullif(s.popup_key, -1), pe.name::text, s.revenue, s.orders
  from get_popup_day_sales(make_date(p_year, p_month, 1), (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date) s
  left join popup_events pe on pe.id = s.popup_key
  order by 1, 4 desc
$function$;

create or replace function public.get_lifetime_sales_totals()
 returns table(total_revenue numeric, total_orders bigint, day_count integer, first_date date, last_date date, popup_count integer, sando_count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  with since as (
    select coalesce(min(start_date), '0001-01-01'::date) as d from popup_events
  ),
  sales as (
    select coalesce(sum(ds.revenue), 0)::numeric as total_revenue,
           coalesce(sum(ds.orders), 0)::bigint   as total_orders,
           count(*)::integer                     as day_count,
           min(ds.sale_date)                     as first_date,
           max(ds.sale_date)                     as last_date
    from since s, get_day_sales(s.d, '2100-12-31') ds
  ),
  sando as (select id from menu_items where name ilike '%산도%'),
  pos as (
    select sale_date d, popup_key pk, menu_item_id mid, quantity q
    from menu_sales_daily where sale_date >= (select d from since)
  ),
  dman as (
    select sale_date d, coalesce(popup_id, -1) pk, menu_item_id mid, quantity q from manual_daily_menu_sales
  ),
  daily as (
    select coalesce(m.pk, p.pk) pk, coalesce(m.mid, p.mid) mid, coalesce(m.q, p.q) q
    from pos p full join dman m on m.d = p.d and m.pk = p.pk and m.mid = p.mid
  ),
  per as (select pk, mid, sum(q)::bigint q from daily group by 1, 2),
  whole as (
    select coalesce(popup_id, -1) pk, menu_item_id mid, sum(quantity)::bigint q from manual_menu_sales group by 1, 2
  ),
  sando_total as (
    select coalesce(sum(coalesce(w.q, p.q)), 0)::bigint as n
    from per p full join whole w on w.pk = p.pk and w.mid = p.mid
    where coalesce(w.mid, p.mid) in (select id from sando)
  )
  select sa.total_revenue, sa.total_orders, sa.day_count, sa.first_date, sa.last_date,
         (select count(*)::integer from popup_events) as popup_count,
         st.n as sando_count
  from sales sa, sando_total st
$function$;
