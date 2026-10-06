-- 통계탭 "누적 총매출" 칸 — 첫 팝업 시작일부터 오늘까지의 전체 매출·주문·영업일을 한 행으로.
--
-- 집계 규칙은 get_monthly_sales_by_date(20261006121810)와 반드시 같아야 한다:
-- 날짜별로 POS 주문과 수동 입력 매출(daily_sales)을 FULL OUTER JOIN해 합치고,
-- 수동 입력이 있는 날은 수동값이 POS를 대체한다. 규칙이 갈리면 달력 월 합계를 다 더한 값과
-- 이 칸의 숫자가 달라져서 어느 쪽이 맞는지 알 수 없게 된다.
--
-- 시작점을 첫 팝업 시작일(min(popup_events.start_date))로 끊는 이유는 그 전에 테스트 주문이
-- 남아 있기 때문이다 (2026-03-31에 6건 130,000원). "맨 처음 팝업부터"가 보고 싶은 값이다.
-- 팝업이 하나도 없으면 '0001-01-01'로 떨어져 전체 기간이 집계된다.
CREATE OR REPLACE FUNCTION public.get_lifetime_sales_totals()
 RETURNS TABLE(
   total_revenue numeric,
   total_orders  bigint,
   day_count     integer,
   first_date    date,
   last_date     date,
   popup_count   integer
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH since AS (
    SELECT COALESCE(MIN(start_date), '0001-01-01'::date) AS d FROM popup_events
  ),
  pos AS (
    SELECT
      (created_at + INTERVAL '9 hours')::date AS d,
      SUM(total_price)::numeric               AS rev,
      COUNT(*)::bigint                        AS cnt
    FROM orders
    GROUP BY 1
  ),
  man AS (
    SELECT
      sale_date                           AS d,
      COALESCE(total_revenue, 0)::numeric AS rev,
      COALESCE(total_orders, 0)::bigint   AS cnt
    FROM daily_sales
  ),
  merged AS (
    SELECT
      COALESCE(m.d, p.d)     AS d,
      COALESCE(m.rev, p.rev) AS rev,
      COALESCE(m.cnt, p.cnt) AS cnt
    FROM pos p
    FULL OUTER JOIN man m ON m.d = p.d
  )
  SELECT
    COALESCE(SUM(mg.rev), 0)::numeric AS total_revenue,
    COALESCE(SUM(mg.cnt), 0)::bigint  AS total_orders,
    COUNT(*)::integer                 AS day_count,
    MIN(mg.d)                         AS first_date,
    MAX(mg.d)                         AS last_date,
    (SELECT COUNT(*)::integer FROM popup_events) AS popup_count
  FROM merged mg, since s
  WHERE mg.d >= s.d
$function$;

-- 누적 총매출은 단일 숫자로 사업 규모가 드러나는 값이라, 다른 매출 RPC와 달리 anon에게는 닫는다.
-- 호출 경로는 서버 액션(requireAdmin) → service_role 하나뿐이다.
REVOKE EXECUTE ON FUNCTION public.get_lifetime_sales_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lifetime_sales_totals() TO authenticated, service_role;
