
-- daily_sales에 메모 컬럼 추가
ALTER TABLE public.daily_sales ADD COLUMN IF NOT EXISTS note text;

-- get_monthly_sales_by_date: orders + daily_sales UNION
CREATE OR REPLACE FUNCTION public.get_monthly_sales_by_date(p_year integer, p_month integer)
RETURNS TABLE(sale_date text, total_revenue numeric, order_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  -- 실제 POS 주문
  SELECT
    to_char(created_at + INTERVAL '9 hours', 'YYYY-MM-DD') AS sale_date,
    SUM(total_price)::numeric                               AS total_revenue,
    COUNT(*)::bigint                                        AS order_count
  FROM orders
  WHERE
    created_at >= make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Seoul')
    AND created_at < make_timestamptz(
      CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
      CASE WHEN p_month = 12 THEN 1          ELSE p_month + 1 END,
      1, 0, 0, 0, 'Asia/Seoul'
    )
  GROUP BY to_char(created_at + INTERVAL '9 hours', 'YYYY-MM-DD')

  UNION ALL

  -- 수동 입력 매출
  SELECT
    to_char(sale_date, 'YYYY-MM-DD') AS sale_date,
    COALESCE(total_revenue, 0)::numeric AS total_revenue,
    COALESCE(total_orders, 0)::bigint   AS order_count
  FROM daily_sales
  WHERE
    EXTRACT(YEAR FROM sale_date)  = p_year
    AND EXTRACT(MONTH FROM sale_date) = p_month
$$;
