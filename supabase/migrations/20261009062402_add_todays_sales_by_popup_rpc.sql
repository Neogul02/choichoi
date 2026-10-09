-- POS 화면의 "매출 배틀" — 오늘 매출이 난 팝업이 둘 이상이면 서로 비교해 보여주기 위한 집계.
--
-- POS는 쿠키의 popupId 하나로 스코프돼 있어서 get_todays_sales_totals로는 자기 팝업 숫자만 알 수 있다.
-- 팝업별로 한 행씩 돌려주고, 행이 2개 이상일 때만 화면에 배틀 칸이 뜬다.
--
-- popup_id가 없는 주문은 JOIN으로 자연히 빠진다 — 경쟁 상대가 되는 건 팝업뿐이고,
-- 소속 없는 주문까지 끼면 "(팝업없음)" 같은 가짜 참가자가 생긴다.
-- 파라미터는 get_todays_sales_totals와 같은 모양(KST 하루 경계를 getKSTDateBounds가 만들어 넘긴다).
CREATE OR REPLACE FUNCTION public.get_todays_sales_by_popup(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE(popup_id bigint, popup_name text, total_revenue numeric, total_orders bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    o.popup_id,
    pe.name::text                            AS popup_name,
    COALESCE(SUM(o.total_price), 0)::numeric AS total_revenue,
    COUNT(*)::bigint                         AS total_orders
  FROM orders o
  JOIN popup_events pe ON pe.id = o.popup_id
  WHERE o.created_at >= p_start
    AND o.created_at <= p_end
  GROUP BY o.popup_id, pe.name
  ORDER BY 3 DESC, 2;
$$;
