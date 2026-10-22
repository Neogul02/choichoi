-- 05_role_sync_trigger.sql 되돌리기. 트리거만 걷는다 — app_metadata.role 값은 그대로 두며,
-- 앱 코드(setUserRole)가 app_metadata를 직접 쓰므로 트리거 없이도 권한 변경은 동작한다.
-- 지운 user_metadata의 role 키는 복원하지 않는다(어떤 코드도 읽지 않는다).
drop trigger if exists user_profiles_sync_role on public.user_profiles;
drop function if exists public.sync_worker_role_to_app_metadata();
