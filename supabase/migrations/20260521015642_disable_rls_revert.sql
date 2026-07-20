
ALTER TABLE public.menu_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON public.orders;

ALTER FUNCTION public.get_menu_sales_by_period RESET search_path;
ALTER FUNCTION public.get_monthly_sales_by_date RESET search_path;
