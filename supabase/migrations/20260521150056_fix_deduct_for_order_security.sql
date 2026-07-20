
-- PUBLIC에서 실행 권한 제거 (anon 포함 모든 비권한 사용자 차단)
REVOKE EXECUTE ON FUNCTION public.deduct_for_order(integer) FROM PUBLIC;
