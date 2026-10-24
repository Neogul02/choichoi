-- 재고 화면(useInventory)이 ingredients의 postgres_changes를 구독하는데, ingredients에는 RLS 정책이 하나도 없어
-- 실시간 이벤트가 누구에게도 가지 않았다(Realtime은 RLS로 읽을 수 있는 행의 변경만 보낸다). 다른 기기에서 재고를
-- 바꿔도 화면은 새로고침 전까지 그대로였다. 재고탭은 로그인한 모든 직원이 조회하므로(proxy.ts) authenticated 읽기를 연다.
-- 쓰기는 여전히 service role 서버 액션(requireManagerOrAdmin)만 한다.
create policy authenticated_read_ingredients on public.ingredients for select to authenticated using (true);
