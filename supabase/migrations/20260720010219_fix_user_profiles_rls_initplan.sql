-- auth.uid()가 행마다 재평가되는 문제 — (select auth.uid())로 교체해 1회 평가
ALTER POLICY users_read_own ON public.user_profiles USING ((select auth.uid()) = id);
ALTER POLICY users_update_own ON public.user_profiles USING ((select auth.uid()) = id);
ALTER POLICY users_insert_own ON public.user_profiles WITH CHECK ((select auth.uid()) = id);
