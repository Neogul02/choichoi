DROP FUNCTION IF EXISTS get_monthly_sales_by_date(integer, integer);

CREATE FUNCTION get_monthly_sales_by_date(p_year integer, p_month integer)
RETURNS TABLE(sale_date text, total_revenue numeric, order_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS sale_date,
    SUM(total_price)::numeric                                    AS total_revenue,
    COUNT(*)::bigint                                             AS order_count
  FROM orders
  WHERE
    created_at >= make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Seoul')
    AND created_at < make_timestamptz(
      CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
      CASE WHEN p_month = 12 THEN 1          ELSE p_month + 1 END,
      1, 0, 0, 0, 'Asia/Seoul'
    )
  GROUP BY to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
  ORDER BY 1;
$$;
