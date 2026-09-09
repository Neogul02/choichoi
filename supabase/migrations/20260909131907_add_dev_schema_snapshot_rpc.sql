-- 개발자 도구의 DB 스키마 뷰어용 스냅샷.
-- 기존에는 스키마를 컴포넌트에 손으로 적어두고 있어서 실제 DB와 계속 어긋났다
-- (테이블 19개만 적혀 있고 payroll_*, storage_* 5개가 빠져 있었다).
-- 여기서 실제 카탈로그를 읽어 내려주면 구조가 바뀌어도 화면이 자동으로 따라간다.
create or replace function public.dev_schema_snapshot()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  with tables as (
    select c.oid, c.relname::text as name, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  counts as (
    select t.oid,
           (xpath('/row/c/text()', query_to_xml(
              format('select count(*) as c from public.%I', t.name), false, true, '')))[1]::text::bigint as row_count
    from tables t
  ),
  pks as (
    select con.conrelid as oid, array_agg(a.attname::text) as cols
    from pg_constraint con
    join unnest(con.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    where con.contype = 'p'
    group by con.conrelid
  ),
  fks as (
    select con.conrelid as oid,
           jsonb_agg(jsonb_build_object(
             'column', a.attname::text,
             'refTable', rc.relname::text,
             'refColumn', ra.attname::text
           ) order by a.attname) as items
    from pg_constraint con
    join unnest(con.conkey) with ordinality as k(attnum, ord) on true
    join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
    join pg_class rc on rc.oid = con.confrelid
    join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = fk.attnum
    where con.contype = 'f'
    group by con.conrelid
  ),
  cols as (
    select a.attrelid as oid,
           jsonb_agg(jsonb_build_object(
             'name', a.attname::text,
             'type', format_type(a.atttypid, a.atttypmod),
             'nullable', not a.attnotnull,
             'hasDefault', d.adbin is not null
           ) order by a.attnum) as items
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attnum > 0 and not a.attisdropped
    group by a.attrelid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t.name,
           'rls', t.rls,
           'rowCount', coalesce(cn.row_count, 0),
           'primaryKey', coalesce(p.cols, array[]::text[]),
           'columns', coalesce(c.items, '[]'::jsonb),
           'foreignKeys', coalesce(f.items, '[]'::jsonb)
         ) order by t.name), '[]'::jsonb)
  from tables t
  left join counts cn on cn.oid = t.oid
  left join pks p on p.oid = t.oid
  left join fks f on f.oid = t.oid
  left join cols c on c.oid = t.oid;
$$;

-- 서버 액션(service_role)에서만 호출한다. 브라우저 키로는 실행할 수 없게 막는다.
revoke all on function public.dev_schema_snapshot() from public, anon, authenticated;
grant execute on function public.dev_schema_snapshot() to service_role;
