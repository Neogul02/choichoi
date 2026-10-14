-- 달력(날짜별 매출 프리뷰)에 "그날 어느 팝업이 얼마를 팔았는지"를 겹쳐 보여주기 위한 집계.
--
-- 기존 get_monthly_sales_by_date는 날짜당 1행(전체 합산)만 돌려준다. 여러 팝업이 동시에
-- 도는 날이 실제로 있어서(2026-10-09~15 홍대 AK + 분당 AK, 2026-06-19~25 수원 AK + 광교 갤러리아)
-- 날짜 합계를 팝업 기간으로 쪼개 나누면 같은 날 매출이 두 팝업에 중복 계상된다.
-- 그래서 팝업별 매출은 주문 행에서 직접 집계한다.
--
-- popup_id가 NULL인 주문이 과거에 실제로 있다(2026-05: 872건 ₩15,199,500 — 당시 POS가
-- 팝업을 안 받던 시기). JOIN으로 떨어뜨리면 팝업별 합이 그날 매출보다 조용히 작아지므로
-- LEFT JOIN으로 남기고 popup_id NULL(= 화면에서 "팝업 미지정")로 돌려준다.
-- 이 규칙 덕에 날짜별 팝업 행의 합 = get_monthly_sales_by_date의 POS 합이 정확히 일치한다
-- (2026-05 20일 전부 대조, 불일치 0건).
--
-- 수동 입력 매출(daily_sales)은 날짜 단위라 팝업으로 나눌 수 없어 여기 포함하지 않는다.
-- 달력 칸의 금액은 "수동이 POS를 대체한다"는 기존 규칙을 그대로 따르고(20261006121810),
-- 팝업 내역은 POS 기준임을 화면에서 밝힌다.
CREATE OR REPLACE FUNCTION public.get_monthly_sales_by_date_popup(p_year integer, p_month integer)
 RETURNS TABLE(sale_date text, popup_id bigint, popup_name text, total_revenue numeric, order_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    to_char(o.created_at + INTERVAL '9 hours', 'YYYY-MM-DD') AS sale_date,
    o.popup_id,
    pe.name::text                                            AS popup_name,
    SUM(o.total_price)::numeric                              AS total_revenue,
    COUNT(*)::bigint                                         AS order_count
  FROM orders o
  LEFT JOIN popup_events pe ON pe.id = o.popup_id
  WHERE
    o.created_at >= make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Seoul')
    AND o.created_at < make_timestamptz(
      CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
      CASE WHEN p_month = 12 THEN 1          ELSE p_month + 1 END,
      1, 0, 0, 0, 'Asia/Seoul'
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 4 DESC
$function$;
