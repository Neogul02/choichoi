
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- 서비스 롤(서버 액션)은 RLS 우회하므로 별도 정책 불필요
-- 인증된 어드민은 모든 계약서 조회 가능
CREATE POLICY "contracts_admin_all" ON public.contracts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
