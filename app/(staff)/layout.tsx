import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// 로그인 여부만 확인(재고탭은 user 역할도 조회 가능).
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/pos');
  return <>{children}</>;
}
