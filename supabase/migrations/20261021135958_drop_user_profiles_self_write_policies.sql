-- 20261018135538과 같은 내용을 한 번 더 적용한 기록이다(이미 지워진 정책이라 원격에서는 아무것도 바뀌지 않았다).
-- 이전 적용 여부를 확인하지 않고 다시 apply_migration 해서 원격 이력에 version이 하나 더 생겼고, 로컬 파일이 없으면
-- Supabase 배포가 "Remote migration versions not found in local migrations directory"로 멈추므로 같은 version으로
-- 파일을 남긴다. if exists라 재실행해도 안전하다.
--
-- 같은 날 auth.users.raw_app_meta_data.role을 user_profiles.worker_role로 다시 백필했다(데이터 작업이라 SQL로 실행).
-- 바뀐 계정 0 — 백필은 이미 2026-10-18 22:55 KST, 7ea8ccb 배포 직전에 같은 SQL로 적용돼 있었다(그때 역할별
-- admin 2·kiosk 1·user 44, 불일치 0). 이 백필은 이력에 남도록 supabase/pending/05_role_sync_trigger.sql에 멱등 형태로 있다.
--
-- 본인 행이면 worker_role까지 REST로 바꿀 수 있었다(컬럼 제한 없음). users_insert_own도 프로필 행이 없는 계정이
-- worker_role = 'admin'으로 본인 행을 만들 수 있게 했다. 모든 쓰기는 service role 서버 액션이 한다.
drop policy if exists users_update_own on public.user_profiles;
drop policy if exists users_insert_own on public.user_profiles;
