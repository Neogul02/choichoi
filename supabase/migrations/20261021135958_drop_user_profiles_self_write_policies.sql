-- 20261018135538과 같은 내용을 한 번 더 적용한 기록이다(이미 지워진 정책이라 원격에서는 아무것도 바뀌지 않았다).
-- 백필 작업 중 이전 적용 여부를 확인하지 않고 다시 apply_migration 해서 원격 이력에 version이 하나 더 생겼고,
-- 로컬 파일이 없으면 CLI가 원격 이력 불일치로 멈추므로 같은 version으로 파일을 남긴다. if exists라 재실행해도 안전하다.
--
-- 같은 날(2026-10-21 KST 23시) auth.users.raw_app_meta_data.role을 user_profiles.worker_role로 백필했다
-- (데이터 작업이라 마이그레이션이 아니라 SQL로 실행). 역할별 전/후: admin 2→2, kiosk 1→1, user 44→44
-- (프로필 없는 계정 1개는 role 없음 = 일반 user), 역할이 바뀐 계정 0, app_metadata의 다른 키 변경 0.
-- 코드(7ea8ccb)는 2026-10-18 22:58 KST에 이 백필 없이 배포됐다 — 그 사이 관리자·키오스크가 일반 user로 판정됐다.

drop policy if exists users_update_own on public.user_profiles;
drop policy if exists users_insert_own on public.user_profiles;
