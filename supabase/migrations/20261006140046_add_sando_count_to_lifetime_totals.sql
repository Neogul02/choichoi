-- 통계탭 누적 칸에 "지금까지 판 산도 개수"를 추가한다. 반환 컬럼이 늘어나 CREATE OR REPLACE로는
-- 바꿀 수 없어 DROP 후 재생성한다 (호출처는 fetchLifetimeSalesTotals 하나뿐).
--
-- 수량 집계 규칙은 팝업 통계 화면(usePopupStats의 applyMenuManualOverrides)과 똑같이 맞춘다:
--   (팝업, 메뉴) 단위로 날짜별 수기 입력 > 기간 수기 입력 > POS 집계
-- 더하지 않고 대체하는 이유는 매출과 같다 — POS를 쓰지 않은 팝업은 수기 입력이 진짜 숫자다.
--
-- popup_id가 NULL인 주문이 1,630건 있어서 조인 키를 COALESCE(popup_id, -1)로 정규화한다.
-- NULL = NULL은 거짓이라 그냥 조인하면 그 주문들이 통째로 빠진다(실제로 1,891개가 누락됐었다).
--
-- "산도"의 정의는 메뉴명에 '산도'가 들어간 품목. 아이스팩·보냉백·할인·테스트 항목이 자동으로
-- 빠진다. 대신 초기 메뉴의 고메버터·흑임자·플레인(합 4개)처럼 이름에 '산도'가 없는 산도는
-- 빠지므로, 그런 이름을 또 쓰게 되면 이 조건을 손봐야 한다.
DROP FUNCTION IF EXISTS public.get_lifetime_sales_totals();

CREATE FUNCTION public.get_lifetime_sales_totals()
 RETURNS TABLE(
   total_revenue numeric,
   total_orders  bigint,
   day_count     integer,
   first_date    date,
   last_date     date,
   popup_count   integer,
   sando_count   bigint
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
  ),
  sales AS (
    SELECT
      COALESCE(SUM(mg.rev), 0)::numeric AS total_revenue,
      COALESCE(SUM(mg.cnt), 0)::bigint  AS total_orders,
      COUNT(*)::integer                 AS day_count,
      MIN(mg.d)                         AS first_date,
      MAX(mg.d)                         AS last_date
    FROM merged mg, since s
    WHERE mg.d >= s.d
  ),
  sando AS (SELECT id FROM menu_items WHERE name ILIKE '%산도%'),
  qty_pos AS (
    SELECT COALESCE(o.popup_id, -1) AS pk, oi.menu_item_id AS mid, SUM(oi.quantity)::bigint AS qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE (o.created_at + INTERVAL '9 hours')::date >= (SELECT d FROM since)
    GROUP BY 1, 2
  ),
  qty_man AS (
    SELECT COALESCE(popup_id, -1) AS pk, menu_item_id AS mid, SUM(quantity)::bigint AS qty
    FROM manual_menu_sales GROUP BY 1, 2
  ),
  qty_dman AS (
    SELECT COALESCE(popup_id, -1) AS pk, menu_item_id AS mid, SUM(quantity)::bigint AS qty
    FROM manual_daily_menu_sales GROUP BY 1, 2
  ),
  qty_keys AS (
    SELECT pk, mid FROM qty_pos
    UNION SELECT pk, mid FROM qty_man
    UNION SELECT pk, mid FROM qty_dman
  ),
  sando_total AS (
    SELECT COALESCE(SUM(COALESCE(d.qty, m.qty, p.qty, 0)), 0)::bigint AS n
    FROM qty_keys k
    LEFT JOIN qty_pos  p ON p.pk = k.pk AND p.mid = k.mid
    LEFT JOIN qty_man  m ON m.pk = k.pk AND m.mid = k.mid
    LEFT JOIN qty_dman d ON d.pk = k.pk AND d.mid = k.mid
    WHERE k.mid IN (SELECT id FROM sando)
  )
  SELECT
    sa.total_revenue, sa.total_orders, sa.day_count, sa.first_date, sa.last_date,
    (SELECT COUNT(*)::integer FROM popup_events) AS popup_count,
    st.n AS sando_count
  FROM sales sa, sando_total st
$function$;

-- 누적 지표는 단일 숫자로 사업 규모가 드러나므로 anon에게는 닫는다 (호출은 requireAdmin 액션뿐)
REVOKE EXECUTE ON FUNCTION public.get_lifetime_sales_totals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lifetime_sales_totals() TO authenticated, service_role;
