-- 20261018135538과 같은 내용을 한 번 더 적용한 기록이다(이미 지워진 정책이라 원격에서는 아무것도 바뀌지 않았다).
-- 백필 작업 중 이전 적용 여부를 확인하지 않고 다시 apply_migration 해서 원격 이력에 version이 하나 더 생겼고,
-- 로컬 파일이 없으면 CLI가 원격 이력 불일치로 멈추므로 같은 version으로 파일을 남긴다. if exists라 재실행해도 안전하다.
--
-- 같은 날(2026-10-21 KST 23시) auth.users.raw_app_meta_data.role을 user_profiles.worker_role로 백필했다
-- (데이터 작업이라 마이그레이션이 아니라 SQL로 실행). 역할별 전/후: admin 2→2, kiosk 1→1, user 44→44
-- (프로필 없는 계정 1개는 role 없음 = 일반 user), 역할이 바뀐 계정 0, app_metadata의 다른 키 변경 0.
-- 코드(7ea8ccb)는 2026-10-18 22:58 KST에 이 백필 없이 배포됐다 — 그 사이 새 배포로 들어온 요청에서는 관리자·키오스크가
-- 일반 user로 판정됐다. 단 그 기간에도 키오스크 출퇴근 기록(requireKioskOrAdmin)이 매일 남아 있어, 상시 켜 둔 키오스크
-- 아이패드는 이전 배포에 붙어 있었던 것으로 보인다(Vercel 배포 고정 — 미확인, 요청 로그로 확인 필요).
-- 이 백필은 이력에 남도록 supabase/pending/05_role_sync_trigger.sql에 멱등 형태로 다시 들어 있다.

drop policy if exists users_update_own on public.user_profiles;
drop policy if exists users_insert_own on public.user_profiles;
