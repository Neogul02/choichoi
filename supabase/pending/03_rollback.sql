-- 03(·03b) 되돌리기: 누적 합계를 원본(orders·order_items) 집계로 되돌린다 — 2026-10-17 적용 전 원격 정의 그대로.
drop function if exists public.get_lifetime_sales_totals_v2();

CREATE OR REPLACE FUNCTION public.get_lifetime_sales_totals()
 RETURNS TABLE(total_revenue numeric, total_orders bigint, day_count integer, first_date date, last_date date, popup_count integer, sando_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH since AS (
    SELECT COALESCE(MIN(start_date), '0001-01-01'::date) AS d FROM popup_events
  ),
  pos_popup AS (
    SELECT
      (created_at + INTERVAL '9 hours')::date AS d,
      COALESCE(popup_id, -1)                  AS pk,
      SUM(total_price)::numeric               AS rev,
      COUNT(*)::bigint                        AS cnt
    FROM orders
    GROUP BY 1, 2
  ),
  pos AS (
    SELECT COALESCE(v.sale_date, p.d) AS d,
           SUM(COALESCE(v.total_revenue::numeric, p.rev))::numeric AS rev,
           SUM(COALESCE(v.total_orders::bigint, p.cnt))::bigint    AS cnt
    FROM pos_popup p
    FULL OUTER JOIN popup_daily_sales v ON v.sale_date = p.d AND v.popup_id = p.pk
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
