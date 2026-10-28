-- 수기 정정 우선순위를 DB 한 곳에 둔다. 지금까지 같은 규칙이 달력 RPC 2개·누적 합계 RPC·서버 코드(팝업 통계, 통계탭
-- 오늘 영역)에 각자 구현돼 있었고, 한쪽만 고치면 같은 날 매출이 화면마다 달라졌다(10/18·10/24 수기 입력 건).
--   팝업 하루 = popup_daily_sales(팝업 정정) > sales_daily(그 팝업의 POS 일별 집계, 20261018133259)
--   날짜 하루 = daily_sales(날짜 전체 정정) > 그날 팝업 하루의 합
-- popup_key는 sales_daily와 같다(popup_id, 팝업 없는 주문은 -1). 이 함수들을 쓰도록 기존 RPC를 바꾸는 건 결과가 행 단위로
-- 같음을 확인한 뒤 별도 마이그레이션에서 한다.
create or replace function public.get_popup_day_sales(p_start date, p_end date)
returns table(sale_date date, popup_key bigint, revenue numeric, orders bigint, corrected boolean)
language sql
stable
set search_path to 'public'
as $$
  select coalesce(v.sale_date, p.sale_date),
         coalesce(v.popup_id, p.popup_key),
         coalesce(v.total_revenue::numeric, p.revenue),
         coalesce(v.total_orders::bigint, p.orders),
         v.popup_id is not null
  from (select * from sales_daily where sale_date between p_start and p_end) p
  full join (select * from popup_daily_sales where sale_date between p_start and p_end) v
    on v.sale_date = p.sale_date and v.popup_id = p.popup_key
$$;

create or replace function public.get_day_sales(p_start date, p_end date)
returns table(sale_date date, revenue numeric, orders bigint, corrected boolean)
language sql
stable
set search_path to 'public'
as $$
  with pop as (
    select sale_date, sum(revenue)::numeric rev, sum(orders)::bigint cnt from get_popup_day_sales(p_start, p_end) group by 1
  ), man as (
    select sale_date, coalesce(total_revenue, 0)::numeric rev, coalesce(total_orders, 0)::bigint cnt
    from daily_sales where sale_date between p_start and p_end
  )
  select coalesce(m.sale_date, p.sale_date), coalesce(m.rev, p.rev), coalesce(m.cnt, p.cnt), m.sale_date is not null
  from pop p full join man m on m.sale_date = p.sale_date
$$;

revoke execute on function public.get_popup_day_sales(date, date) from public, anon, authenticated;
revoke execute on function public.get_day_sales(date, date) from public, anon, authenticated;
