
-- Enable RLS on all public tables
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Allow anon to read orders so client-side realtime subscriptions work
-- (pos/page, orders/page listen to postgres_changes on orders table)
CREATE POLICY "anon_select_orders" ON public.orders
  FOR SELECT TO anon USING (true);

-- Fix function search_path to prevent search_path injection
ALTER FUNCTION public.get_menu_sales_by_period SET search_path = public;
ALTER FUNCTION public.get_monthly_sales_by_date SET search_path = public;
