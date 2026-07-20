-- 급여 정산·개인 스케줄: staff_id + work_date 범위 조회 (기존 인덱스는 work_date 선두라 미커버)
CREATE INDEX IF NOT EXISTS roster_assignments_staff_date_idx
  ON public.roster_assignments (staff_id, work_date);

-- 주문 상세·통계 조인: order_items에 PK 외 인덱스 부재
CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);

-- 오늘 매출·캘린더 통계: created_at 날짜 범위 조회
CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON public.orders (created_at);
