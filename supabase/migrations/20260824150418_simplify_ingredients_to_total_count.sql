-- 박스(용기) 단위 개념 삭제 — sealed_count(미개봉)/opened_remaining(개봉) 이원 관리를
-- total_count 단일 수량으로 통합. 그동안 화면 어디서도 실제로 쓰이지 않던
-- reorder_at_containers(박스 수 기준)도 total_count 기준 reorder_at으로 전환해 처음으로
-- 저재고 판정에 실제 사용한다.
alter table ingredients add column total_count numeric not null default 0;
alter table ingredients add column reorder_at numeric not null default 5;

update ingredients set
  total_count = sealed_count * container_size + opened_remaining,
  reorder_at = greatest(1, reorder_at_containers * container_size);

alter table restock_events add column delta numeric not null default 0;

-- 과거 입고 이력은 (당시가 아닌) 현재 container_size 기준으로 환산한 근사치 —
-- container_size가 그 사이 바뀐 재료라면 옛 이력의 delta가 정확하지 않을 수 있음
update restock_events re set
  delta = re.sealed_delta * coalesce(i.container_size, 1) + re.opened_delta
from ingredients i
where i.id = re.ingredient_id;

alter table ingredients
  drop column sealed_count,
  drop column opened_remaining,
  drop column container_size,
  drop column container_unit,
  drop column reorder_at_containers;

alter table restock_events
  drop column sealed_delta,
  drop column opened_delta;

drop function if exists public.apply_restock(text, integer, numeric, text, text);

create function public.apply_restock(
  p_ingredient_id text,
  p_delta numeric,
  p_note text default null,
  p_created_by text default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into restock_events(ingredient_id, delta, note, created_by)
    values (p_ingredient_id, p_delta, p_note, p_created_by);

  update ingredients
    set total_count = greatest(0, total_count + p_delta)
    where id = p_ingredient_id;
end;
$$;

revoke execute on function public.apply_restock(text, numeric, text, text) from public, anon, authenticated;
