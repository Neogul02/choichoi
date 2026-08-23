import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// 재고탭이 user 역할에게도 열리면서 이 그룹 전체를 admin|manager로 막던 검사는
// /roster 전용으로 이동(app/(staff)/roster/layout.tsx) — 여기는 로그인 여부만 확인.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/pos');
  return <>{children}</>;
}
