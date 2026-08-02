-- 긴급 복원: 배포된 프로덕션 코드가 아직 이 컬럼을 select한다 (fetchAllUserProfiles·getMyProfile).
-- 20260802025809의 DROP은 코드 배포 전에 실행돼 HR 계정연결·/my 프로필 조회를 깨뜨렸음.
-- total_revenue를 select 목록에서 제거한 코드가 프로덕션에 배포된 뒤에 다시 DROP할 것 (expand/contract).
alter table public.user_profiles add column if not exists total_revenue integer not null default 0;
