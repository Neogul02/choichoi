-- roster.ts의 autoFillRoster 등이 shift_id IN(...) AND work_date BETWEEN ... 형태로
-- 항상 함께 조회 — 기존 shift_id 단일 인덱스를 복합 인덱스로 교체.
DROP INDEX IF EXISTS idx_roster_shift_requirements_shift_id;
CREATE INDEX IF NOT EXISTS idx_roster_shift_requirements_shift_date
  ON public.roster_shift_requirements (shift_id, work_date);
