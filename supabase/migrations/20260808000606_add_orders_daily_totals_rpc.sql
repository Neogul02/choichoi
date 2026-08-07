-- getDailySalesByPeriod(app/actions/stats.ts)가 최대 1만 행을 페이지네이션으로 끌고 와
-- JS에서 날짜별 합산하던 것을 DB GROUP BY로 대체 — get_monthly_sales_by_date와 동일 패턴.
CREATE OR REPLACE FUNCTION public.get_orders_daily_totals(
  p_start timestamptz,
  p_end timestamptz,
  p_popup_id integer DEFAULT NULL
)
RETURNS TABLE(sale_date text, total_revenue numeric, order_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    to_char(created_at + INTERVAL '9 hours', 'YYYY-MM-DD') AS sale_date,
    SUM(total_price)::numeric                               AS total_revenue,
    COUNT(*)::bigint                                        AS order_count
  FROM orders
  WHERE
    created_at >= p_start
    AND created_at <= p_end
    AND (p_popup_id IS NULL OR popup_id = p_popup_id)
  GROUP BY to_char(created_at + INTERVAL '9 hours', 'YYYY-MM-DD')
  ORDER BY 1;
$$;
