-- 마이페이지 "내 판매 통계"가 그 직원의 주문을 1,000건씩 끊어 전부 내려받은 뒤 서버 액션에서 합산했다
-- (getMyOrderStats → computeOrderStatsForCashierName). 페이지마다 cashier_name으로 주문 전체를 훑어 정렬했고,
-- 주문이 쌓일수록 왕복과 전송량이 선형으로 늘었다. 합산은 (KST 날짜, 팝업, 결제수단) 단위로 DB가 하고 앱은
-- 그 행들(수십 개)만 팝업 버킷에 나눠 담는다. 날짜는 다른 매출 RPC와 같은 KST 영업일((created_at + 9h)::date).
-- 다른 직원의 판매 실적이 담기므로 service role(서버 액션)만 호출한다.
create or replace function public.get_cashier_order_stats(p_cashier_name text)
returns table(sale_date date, popup_id bigint, payment_method text, orders bigint, revenue numeric)
language sql
stable
set search_path to 'public'
as $$
  select (created_at + interval '9 hours')::date, popup_id, payment_method::text, count(*)::bigint, sum(total_price)::numeric
  from orders
  where cashier_name = p_cashier_name and payment_status = 'completed'
  group by 1, 2, 3
$$;

revoke execute on function public.get_cashier_order_stats(text) from public, anon, authenticated;
