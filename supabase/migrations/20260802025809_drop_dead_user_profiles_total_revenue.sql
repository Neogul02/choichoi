-- 유일한 writer(increment_worker_revenue RPC)는 20260802021328에서 삭제됨.
-- UI 표시 0곳, 갱신 경로 0곳 — 죽은 비정규화 집계 컬럼 제거
alter table public.user_profiles drop column if exists total_revenue;
