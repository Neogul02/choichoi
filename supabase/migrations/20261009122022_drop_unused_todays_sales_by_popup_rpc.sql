-- get_todays_hourly_sales_by_popup(20261009070908)가 완전히 대체했다.
-- 그 마이그레이션에서 바로 지우지 않은 것은, 배포가 끝나기 전까지 구 클라이언트가
-- 이 함수를 계속 호출하고 있었기 때문이다(먼저 지우면 POS에 오류가 뜬다).
-- 새 코드가 배포된 뒤 정리한다.
DROP FUNCTION IF EXISTS public.get_todays_sales_by_popup(timestamptz, timestamptz);
