-- POS 매출 배틀을 막대에서 "시간대별 누적 곡선"으로 바꾸기 위한 집계.
-- 팝업 × KST 시각(0-23) 단위로 그 시간대 매출·건수를 돌려준다. 누적은 화면에서 더한다 —
-- 서버에서 누적까지 만들면 조회 범위가 바뀔 때마다 SQL을 고쳐야 하고, 합계도 이 행들에서 파생된다.
--
-- created_at은 timestamp without time zone(naive UTC)이라 +9시간을 더해 KST 시각을 뽑는다.
-- popup_id가 없는 주문은 JOIN으로 빠진다 (get_todays_sales_by_popup과 같은 이유 — 경쟁 상대는 팝업뿐).
--
-- 기존 get_todays_sales_by_popup은 이 함수로 대체되지만 지우지 않는다.
-- 배포 중에는 구 클라이언트가 아직 그 함수를 호출하므로, 먼저 지우면 POS에 오류가 뜬다.
-- 새 코드가 완전히 배포된 뒤 따로 정리할 것.
CREATE OR REPLACE FUNCTION public.get_todays_hourly_sales_by_popup(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS TABLE(
  popup_id      bigint,
  popup_name    text,
  hour_kst      integer,
  total_revenue numeric,
  total_orders  bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    o.popup_id,
    pe.name::text                                                 AS popup_name,
    EXTRACT(HOUR FROM o.created_at + INTERVAL '9 hours')::integer AS hour_kst,
    COALESCE(SUM(o.total_price), 0)::numeric                      AS total_revenue,
    COUNT(*)::bigint                                              AS total_orders
  FROM orders o
  JOIN popup_events pe ON pe.id = o.popup_id
  WHERE o.created_at >= p_start
    AND o.created_at <= p_end
  GROUP BY o.popup_id, pe.name, 3
  ORDER BY 3, 1;
$$;
