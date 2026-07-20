-- 코드 참조 0건 레거시 테이블 삭제 (user_profiles/staff_profiles·roster_* 체계로 대체됨)
-- 삭제 순서: FK 방향(schedule_slots → workers) 고려
DROP TABLE IF EXISTS public.schedule_slots;
DROP TABLE IF EXISTS public.cheers;
DROP TABLE IF EXISTS public.workers;
