
create or replace function public.decrement_menu_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  item record;
begin
  for item in select * from jsonb_to_recordset(p_items) as x(id integer, count integer)
  loop
    update menu_items
    set stock = stock - item.count
    where id = item.id and stock is not null;
  end loop;
end;
$$;

alter publication supabase_realtime add table public.menu_items;
