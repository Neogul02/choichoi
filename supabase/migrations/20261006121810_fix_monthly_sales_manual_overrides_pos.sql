-- 달력 "월 매출"이 실제보다 부풀려지던 문제 — 수동 입력 매출이 POS 매출에 더해지고 있었다.
--
-- get_monthly_sales_by_date는 POS 주문 집계와 수동 입력 매출(daily_sales)을 UNION ALL로
-- 붙이기만 하고 날짜별로 합치지 않았다. 두 테이블에 모두 있는 날짜는 행이 2개 나왔고,
-- app/actions/stats.ts가 byDate에는 마지막 행만 남기면서(덮어쓰기) monthTotal에는 둘 다
-- 더해서, 달력 칸의 합과 상단 월 매출이 어긋났다. 추정 정산액(월 매출 × (1-수수료))도 같이 틀렸다.
--
-- 실제 영향: 두 테이블에 같은 날짜가 있는 19일에서 발생.
--   2026-04  36,650,000 → 36,591,500
--   2026-05  77,083,000 → 60,786,000
--   2026-07 362,979,000 → 348,268,000
--   2026-10  17,677,500 → 12,713,000
--
-- 올바른 규칙은 "수동 입력이 POS를 대체한다"이다. POS를 거의 쓰지 않은 날(2026-04-03은
-- POS 1건 17,500원, 수동 71건 1,097,500원)이 있어 수동값이 정정된 진짜 숫자이기 때문이고,
-- usePopupStats·usePopupComparison·DayDetailModal도 이미 전부 대체로 동작한다.
-- 매출뿐 아니라 주문 건수도 같은 규칙으로 대체한다 — 한쪽만 대체하면 건당 단가가 어긋난다.
--
-- FULL OUTER JOIN이라 수동만 있는 날(POS 미사용)과 POS만 있는 날 모두 그대로 나온다.
CREATE OR REPLACE FUNCTION public.get_monthly_sales_by_date(p_year integer, p_month integer)
 RETURNS TABLE(sale_date text, total_revenue numeric, order_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH pos AS (
    SELECT
      to_char(created_at + INTERVAL '9 hours', 'YYYY-MM-DD') AS d,
      SUM(total_price)::numeric                              AS rev,
      COUNT(*)::bigint                                       AS cnt
    FROM orders
    WHERE
      created_at >= make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Seoul')
      AND created_at < make_timestamptz(
        CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
        CASE WHEN p_month = 12 THEN 1          ELSE p_month + 1 END,
        1, 0, 0, 0, 'Asia/Seoul'
      )
    GROUP BY 1
  ),
  man AS (
    SELECT
      to_char(sale_date, 'YYYY-MM-DD')    AS d,
      COALESCE(total_revenue, 0)::numeric AS rev,
      COALESCE(total_orders, 0)::bigint   AS cnt
    FROM daily_sales
    WHERE
      EXTRACT(YEAR FROM sale_date)  = p_year
      AND EXTRACT(MONTH FROM sale_date) = p_month
  )
  SELECT
    COALESCE(m.d, p.d)     AS sale_date,
    COALESCE(m.rev, p.rev) AS total_revenue,
    COALESCE(m.cnt, p.cnt) AS order_count
  FROM pos p
  FULL OUTER JOIN man m ON m.d = p.d
$function$;
