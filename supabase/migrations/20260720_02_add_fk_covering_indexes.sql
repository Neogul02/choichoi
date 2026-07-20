-- FK 커버링 인덱스 — Supabase performance advisor 지적분 중 실제 조인·필터 경로 8건
CREATE INDEX IF NOT EXISTS idx_roster_assignments_shift_id ON public.roster_assignments (shift_id);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_store_id ON public.roster_assignments (store_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_store_id ON public.staff_profiles (store_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_profile_id ON public.staff_profiles (user_profile_id);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON public.contracts (created_by);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON public.order_items (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_roster_shift_requirements_shift_id ON public.roster_shift_requirements (shift_id);
CREATE INDEX IF NOT EXISTS idx_popup_events_store_id ON public.popup_events (store_id);
