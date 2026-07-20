-- 사용자가 2026-07-20 Supabase에서 직접 실행 완료 (기록용)
-- pos_note는 서버 액션(service role)만 접근하므로 정책 없이 RLS만 활성화
ALTER TABLE public.pos_note ENABLE ROW LEVEL SECURITY;
