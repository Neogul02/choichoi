
-- Enable RLS on all public tables
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deduction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;

-- anon SELECT 허용: POS 메뉴 표시
CREATE POLICY "anon_read_menu_items" ON public.menu_items
  FOR SELECT TO anon USING (true);

-- anon SELECT 허용: Realtime postgres_changes 구독
CREATE POLICY "anon_read_orders" ON public.orders
  FOR SELECT TO anon USING (true);

-- anon SELECT 허용: 공개 메모 페이지 (admin gate 없음)
CREATE POLICY "anon_read_memos" ON public.memos
  FOR SELECT TO anon USING (true);

-- 함수 search_path 고정 (Function Search Path Mutable 경고 해소)
ALTER FUNCTION public.get_monthly_sales_by_date SET search_path = public;
ALTER FUNCTION public.get_menu_sales_by_period SET search_path = public;
ALTER FUNCTION public.set_updated_at SET search_path = public;

-- deduct_for_order: anon/authenticated 실행 권한 제거 (service role에서만 호출)
REVOKE EXECUTE ON FUNCTION public.deduct_for_order(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_for_order(integer) FROM authenticated;
