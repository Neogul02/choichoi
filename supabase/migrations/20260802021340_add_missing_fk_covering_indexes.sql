-- Supabase advisor: FK 커버링 인덱스 누락 3건 (7/24 이후 신규)
create index if not exists idx_manual_menu_sales_menu_item_id on public.manual_menu_sales (menu_item_id);
create index if not exists idx_restock_events_ingredient_id on public.restock_events (ingredient_id);
create index if not exists idx_roster_shifts_popup_id on public.roster_shifts (popup_id);
