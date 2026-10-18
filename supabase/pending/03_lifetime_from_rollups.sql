-- 누적 합계를 원본 대신 일별 집계(02)에서 읽게 한다. 규칙은 그대로다 — 바뀌는 건 POS 부분의 출처뿐:
--   pos_popup : orders 전체 GROUP BY  → sales_daily
--   qty_pos   : order_items ⋈ orders → menu_sales_daily
-- 바로 바꾸지 않고 v2를 옆에 만든 뒤 v1(현재)과 결과가 완전히 같은지 맞대 보고 바꾼다(런북 3단계).
-- 맞대기 SQL: select * from get_lifetime_sales_totals() except select * from get_lifetime_sales_totals_v2();  → 0행
--            (반대 방향도 0행)

create or replace function public.get_lifetime_sales_totals_v2()
 returns table(total_revenue numeric, total_orders bigint, day_count integer, first_date date, last_date date, popup_count integer, sando_count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  with since as (
    select coalesce(min(start_date), '0001-01-01'::date) as d from popup_events
  ),
  pos_popup as (
    select sale_date as d, popup_key as pk, revenue::numeric as rev, orders::bigint as cnt
    from sales_daily
  ),
  pos as (
    select coalesce(v.sale_date, p.d) as d,
           sum(coalesce(v.total_revenue::numeric, p.rev))::numeric as rev,
           sum(coalesce(v.total_orders::bigint, p.cnt))::bigint    as cnt
    from pos_popup p
    full outer join popup_daily_sales v on v.sale_date = p.d and v.popup_id = p.pk
    group by 1
  ),
  man as (
    select sale_date as d, coalesce(total_revenue, 0)::numeric as rev, coalesce(total_orders, 0)::bigint as cnt
    from daily_sales
  ),
  merged as (
    select coalesce(m.d, p.d) as d, coalesce(m.rev, p.rev) as rev, coalesce(m.cnt, p.cnt) as cnt
    from pos p
    full outer join man m on m.d = p.d
  ),
  sales as (
    select coalesce(sum(mg.rev), 0)::numeric as total_revenue,
           coalesce(sum(mg.cnt), 0)::bigint  as total_orders,
           count(*)::integer                 as day_count,
           min(mg.d)                         as first_date,
           max(mg.d)                         as last_date
    from merged mg, since s
    where mg.d >= s.d
  ),
  sando as (select id from menu_items where name ilike '%산도%'),
  qty_pos as (
    select popup_key as pk, menu_item_id as mid, sum(quantity)::bigint as qty
    from menu_sales_daily
    where sale_date >= (select d from since)
    group by 1, 2
  ),
  qty_man as (
    select coalesce(popup_id, -1) as pk, menu_item_id as mid, sum(quantity)::bigint as qty
    from manual_menu_sales group by 1, 2
  ),
  qty_dman as (
    select coalesce(popup_id, -1) as pk, menu_item_id as mid, sum(quantity)::bigint as qty
    from manual_daily_menu_sales group by 1, 2
  ),
  qty_keys as (
    select pk, mid from qty_pos
    union select pk, mid from qty_man
    union select pk, mid from qty_dman
  ),
  sando_total as (
    select coalesce(sum(coalesce(d.qty, m.qty, p.qty, 0)), 0)::bigint as n
    from qty_keys k
    left join qty_pos  p on p.pk = k.pk and p.mid = k.mid
    left join qty_man  m on m.pk = k.pk and m.mid = k.mid
    left join qty_dman d on d.pk = k.pk and d.mid = k.mid
    where k.mid in (select id from sando)
  )
  select sa.total_revenue, sa.total_orders, sa.day_count, sa.first_date, sa.last_date,
         (select count(*)::integer from popup_events) as popup_count,
         st.n as sando_count
  from sales sa, sando_total st
$function$;
