-- 팝업 하루 값에 날짜 전체 정정(daily_sales)을 넣는다 — 그날 기간이 걸친 팝업이 정확히 하나일 때만.
-- POS 도입 전(4~9월)의 실제 매출은 대부분 daily_sales에만 있어서, 달력의 팝업별 줄은 POS(0원)를 보여주고 팝업 통계는
-- (서버 코드가 따로) daily_sales를 써서 같은 날 같은 팝업 숫자가 화면마다 달랐다. 팝업이 둘 이상인 날의 날짜 전체 값은
-- 어느 팝업 몫인지 모르므로 팝업 줄에는 넣지 않는다(현재 그런 행은 0건). 우선순위: 팝업 정정 > (단일 팝업일 때) 날짜 전체 정정 > POS.
-- 날짜 하루 합계(get_day_sales)는 원래부터 날짜 전체 정정이 우선이라 바뀌지 않는다.
create or replace function public.get_popup_day_sales(p_start date, p_end date)
returns table(sale_date date, popup_key bigint, revenue numeric, orders bigint, corrected boolean)
language sql
stable
set search_path to 'public'
as $$
  with single as (
    select ds.sale_date, min(pe.id) as popup_id, ds.total_revenue, ds.total_orders
    from daily_sales ds
    join popup_events pe on ds.sale_date between pe.start_date and pe.end_date
    where ds.sale_date between p_start and p_end
    group by ds.sale_date, ds.total_revenue, ds.total_orders
    having count(*) = 1
  ),
  ov as (
    select coalesce(v.sale_date, s.sale_date) as sale_date,
           coalesce(v.popup_id, s.popup_id) as popup_id,
           coalesce(v.total_revenue, s.total_revenue)::numeric as rev,
           coalesce(v.total_orders, s.total_orders)::bigint as cnt
    from (select * from popup_daily_sales where sale_date between p_start and p_end) v
    full join single s on s.sale_date = v.sale_date and s.popup_id = v.popup_id
  )
  select coalesce(o.sale_date, p.sale_date),
         coalesce(o.popup_id, p.popup_key),
         coalesce(o.rev, p.revenue),
         coalesce(o.cnt, p.orders),
         o.popup_id is not null
  from (select * from sales_daily where sale_date between p_start and p_end) p
  full join ov o on o.sale_date = p.sale_date and o.popup_id = p.popup_key
$$;
