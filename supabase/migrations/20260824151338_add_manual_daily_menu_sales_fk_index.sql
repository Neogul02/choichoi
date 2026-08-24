-- Supabase performance advisor: manual_daily_menu_sales_menu_item_id_fkey에 커버링 인덱스 없음
create index if not exists idx_manual_daily_menu_sales_menu_item_id
  on public.manual_daily_menu_sales (menu_item_id);
