-- workers 테이블 삭제(7/20) 후에도 남아 있던 레거시 함수 제거
drop function if exists public.increment_worker_revenue(p_name text, p_amount integer);

-- decrement_menu_stock은 서버(service role)만 호출 — REST 경유 외부 실행 차단
revoke execute on function public.decrement_menu_stock(p_items jsonb) from public, anon, authenticated;
