-- 두 팝업이 같은 날 영업하면 한쪽 팝업의 하루 매출만 정정할 방법이 없던 문제.
--
-- 수동 매출(daily_sales)은 sale_date 하나가 키라 "그날 전체" 정정만 표현한다. 그런데 팝업 수기
-- 입력 모달(PopupManualEntryModal)이 팝업 하나의 하루 매출을 거기에 써 왔고, 팝업 통계는 그 값을
-- 같은 날 영업한 모든 팝업에 그대로 덮어 썼다. 2026-10-09~15(홍대 AK + 분당 AK)에 홍대 AK 공식
-- 전산 매출로 정정하려 하자 그대로 넣으면 달력에서 분당 매출이 빠지고 분당 통계가 홍대 숫자가 된다.
--
-- 그래서 (팝업, 날짜) 단위 정정을 따로 둔다. 규칙:
--   팝업 하루 매출  = 팝업 정정 > 그 팝업의 POS
--   날짜 하루 매출  = daily_sales(날짜 전체 정정) > 팝업별 값의 합
-- daily_sales가 여전히 우선하는 이유는 POS를 안 쓰던 시기에 날짜 단위로 넣은 진짜 숫자들이라서다
-- (20261006121810). 주문 건수도 매출과 같은 규칙으로 대체한다 — 한쪽만 바꾸면 객단가가 어긋난다.

create table public.popup_daily_sales (
  id bigint generated always as identity primary key,
  popup_id bigint not null references public.popup_events(id) on delete cascade,
  sale_date date not null,
  total_revenue bigint not null check (total_revenue >= 0),
  total_orders integer not null default 0 check (total_orders >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (popup_id, sale_date)
);

alter table public.popup_daily_sales enable row level security;

create index popup_daily_sales_sale_date_idx on public.popup_daily_sales (sale_date);

-- 달력 날짜별 합계 — POS를 팝업별로 쪼갠 뒤 팝업 정정으로 대체하고 날짜로 다시 합친다.
-- popup_id NULL 주문은 -1로 정규화해 FULL JOIN에서 떨어지지 않게 한다(정정 행은 NULL이 없다).
CREATE OR REPLACE FUNCTION public.get_monthly_sales_by_date(p_year integer, p_month integer)
 RETURNS TABLE(sale_date text, total_revenue numeric, order_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT
      make_date(p_year, p_month, 1) AS d0,
      (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date AS d1
  ),
  pos_popup AS (
    SELECT
      to_char(created_at + INTERVAL '9 hours', 'YYYY-MM-DD') AS d,
      COALESCE(popup_id, -1)                                 AS pk,
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
    GROUP BY 1, 2
  ),
  pov AS (
    SELECT to_char(s.sale_date, 'YYYY-MM-DD') AS d, s.popup_id AS pk,
           s.total_revenue::numeric AS rev, s.total_orders::bigint AS cnt
    FROM popup_daily_sales s, bounds b
    WHERE s.sale_date >= b.d0 AND s.sale_date < b.d1
  ),
  pos AS (
    SELECT COALESCE(o.d, p.d) AS d,
           SUM(COALESCE(o.rev, p.rev))::numeric AS rev,
           SUM(COALESCE(o.cnt, p.cnt))::bigint  AS cnt
    FROM pos_popup p
    FULL OUTER JOIN pov o ON o.d = p.d AND o.pk = p.pk
    GROUP BY 1
  ),
  man AS (
    SELECT
      to_char(ds.sale_date, 'YYYY-MM-DD')    AS d,
      COALESCE(ds.total_revenue, 0)::numeric AS rev,
      COALESCE(ds.total_orders, 0)::bigint   AS cnt
    FROM daily_sales ds, bounds b
    WHERE ds.sale_date >= b.d0 AND ds.sale_date < b.d1
  )
  SELECT
    COALESCE(m.d, p.d)     AS sale_date,
    COALESCE(m.rev, p.rev) AS total_revenue,
    COALESCE(m.cnt, p.cnt) AS order_count
  FROM pos p
  FULL OUTER JOIN man m ON m.d = p.d
$function$;

-- 달력 칸의 팝업 내역 — 팝업 정정이 있으면 그 팝업의 POS 값을 대체한다
CREATE OR REPLACE FUNCTION public.get_monthly_sales_by_date_popup(p_year integer, p_month integer)
 RETURNS TABLE(sale_date text, popup_id bigint, popup_name text, total_revenue numeric, order_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH pos_popup AS (
    SELECT
      to_char(o.created_at + INTERVAL '9 hours', 'YYYY-MM-DD') AS d,
      o.popup_id                                               AS pid,
      SUM(o.total_price)::numeric                              AS rev,
      COUNT(*)::bigint                                         AS cnt
    FROM orders o
    WHERE
      o.created_at >= make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Seoul')
      AND o.created_at < make_timestamptz(
        CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
        CASE WHEN p_month = 12 THEN 1          ELSE p_month + 1 END,
        1, 0, 0, 0, 'Asia/Seoul'
      )
    GROUP BY 1, 2
  ),
  pov AS (
    SELECT to_char(s.sale_date, 'YYYY-MM-DD') AS d, s.popup_id AS pid,
           s.total_revenue::numeric AS rev, s.total_orders::bigint AS cnt
    FROM popup_daily_sales s
    WHERE s.sale_date >= make_date(p_year, p_month, 1)
      AND s.sale_date < (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date
  ),
  merged AS (
    SELECT COALESCE(v.d, p.d) AS d, COALESCE(v.pid, p.pid) AS pid,
           COALESCE(v.rev, p.rev) AS rev, COALESCE(v.cnt, p.cnt) AS cnt
    FROM pos_popup p
    FULL OUTER JOIN pov v ON v.d = p.d AND v.pid = p.pid
  )
  SELECT mg.d AS sale_date, mg.pid AS popup_id, pe.name::text AS popup_name,
         mg.rev AS total_revenue, mg.cnt AS order_count
  FROM merged mg
  LEFT JOIN popup_events pe ON pe.id = mg.pid
  ORDER BY 1, 4 DESC
$function$;

-- 누적 합계 — 달력과 같은 규칙(팝업 정정 > 팝업 POS, 날짜 정정 > 팝업 합)
CREATE OR REPLACE FUNCTION public.get_lifetime_sales_totals()
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
