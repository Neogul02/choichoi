-- 실시간 구독(lib/supabase.ts)을 anon이 아니라 로그인 사용자 JWT로 열기 위한 선행 단계.
-- postgres_changes는 RLS를 따르므로, authenticated에게 읽기 정책이 없으면 구독이 아무것도 받지 못한다.
-- 지금 있는 anon 읽기 정책(using true)은 공개 anon 키만으로 누구나 REST로 전체 주문을 읽게 해서 지울 것인데,
-- 영업 중 배포된 구 코드가 아직 anon으로 구독하므로 이 단계는 더하기만 한다. anon 정책 삭제는 새 코드 배포 후 별도.
-- 서버 액션은 service role이라 이 정책들과 무관하다.
create policy authenticated_read_orders on public.orders for select to authenticated using (true);
create policy authenticated_read_menu_items on public.menu_items for select to authenticated using (true);
create policy authenticated_read_memos on public.memos for select to authenticated using (true);
