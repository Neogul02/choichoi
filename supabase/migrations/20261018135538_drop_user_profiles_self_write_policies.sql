-- 본인 행이면 worker_role까지 REST로 바꿀 수 있었다(컬럼 제한 없음). worker_role은 setUserRole·백필이 권한의
-- 원본으로 쓰고 workers.ts도 일부 판단에 읽으므로, 직원이 스스로 admin이 될 수 있는 경로였다.
-- users_insert_own도 같다 — 프로필 행이 없는 계정은 worker_role = 'admin'으로 본인 행을 만들 수 있었다.
-- 로그인한 브라우저 코드 중 user_profiles를 쓰는 곳은 없다(모든 쓰기는 service role 서버 액션).
-- 회원가입 직후 password-gate의 health_cert_url update는 로그인 전(anon)이라 이 정책으로도 원래 통과하지 못했다.
-- 본인 조회(users_read_own)는 로그인 화면·NavBar가 이름을 읽느라 유지한다.
drop policy if exists users_update_own on public.user_profiles;
drop policy if exists users_insert_own on public.user_profiles;
