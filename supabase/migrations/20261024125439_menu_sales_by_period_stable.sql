-- get_menu_sales_by_period(3인자)는 읽기만 하는데 기본값 VOLATILE이었다. 플래너가 한 쿼리 안에서도 매번 다시 실행하는
-- 함수로 보고, 호출하는 쪽이 STABLE 함수일 때 인라인·최적화에서 빠진다. 같은 이름의 인자 2개 옛 오버로드는 앱이 쓰지
-- 않지만 삭제가 MCP 확인 단계에서 막혀 남아 있다(지울 때: drop function public.get_menu_sales_by_period(timestamptz, timestamptz)).
alter function public.get_menu_sales_by_period(timestamp with time zone, timestamp with time zone, bigint) stable;
