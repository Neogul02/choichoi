
-- addRestock이 select 후 JS에서 계산해 update하는 2단계 방식이라, 같은 재료를
-- 동시에 입고 처리하면(예: 스태프 두 명이 거의 동시에 스캔) 나중 write가 먼저
-- write를 덮어써 한쪽 수량이 유실될 수 있었다. 단일 UPDATE 문 안에서 델타를
-- 더하도록 원자화한다 (decrement_menu_stock/deduct_for_order와 동일한 패턴).
create or replace function public.apply_restock(
  p_ingredient_id text,
  p_sealed_delta integer,
  p_opened_delta numeric,
  p_note text default null,
  p_created_by text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into restock_events(ingredient_id, sealed_delta, opened_delta, note, created_by)
    values (p_ingredient_id, p_sealed_delta, p_opened_delta, p_note, p_created_by);

  update ingredients
    set sealed_count = greatest(0, sealed_count + p_sealed_delta),
        opened_remaining = greatest(0, opened_remaining + p_opened_delta)
    where id = p_ingredient_id;
end;
$$;

revoke execute on function public.apply_restock(text, integer, numeric, text, text) from public, anon, authenticated;
