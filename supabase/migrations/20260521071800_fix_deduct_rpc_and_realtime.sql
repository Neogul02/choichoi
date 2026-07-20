
-- 1. RPC 버그 수정: rc.qty_per_unit → r_ing.qty_per_unit
CREATE OR REPLACE FUNCTION deduct_for_order(p_order_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
declare
  r_item record;
  r_ing  record;
  need   numeric;
  have_opened numeric;
  need_from_sealed numeric;
  containers_to_open integer;
  leftover numeric;
begin
  for r_item in
    select oi.menu_item_id as menu_id, oi.quantity
    from order_items oi
    where oi.order_id = p_order_id
  loop
    for r_ing in
      select rc.ingredient_id, rc.qty_per_unit,
             ig.sealed_count, ig.opened_remaining,
             ig.container_size
      from recipes rc
      join ingredients ig on ig.id = rc.ingredient_id
      where rc.menu_id = r_item.menu_id
      for update of ig
    loop
      need := r_ing.qty_per_unit * r_item.quantity;
      have_opened := r_ing.opened_remaining;

      if have_opened >= need then
        update ingredients
          set opened_remaining = opened_remaining - need
          where id = r_ing.ingredient_id;
      else
        need_from_sealed := need - have_opened;
        containers_to_open := least(
          ceil(need_from_sealed / r_ing.container_size)::integer,
          r_ing.sealed_count
        );
        leftover := greatest(0, (containers_to_open * r_ing.container_size) - need_from_sealed);
        update ingredients
          set opened_remaining = leftover,
              sealed_count     = greatest(0, sealed_count - containers_to_open)
          where id = r_ing.ingredient_id;
      end if;

      insert into deduction_events(order_id, ingredient_id, qty_deducted)
        values(p_order_id, r_ing.ingredient_id, need);
    end loop;
  end loop;
end;
$$;

-- 2. Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE ingredients;
ALTER PUBLICATION supabase_realtime ADD TABLE deduction_events;
