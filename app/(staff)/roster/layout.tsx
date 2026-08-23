import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// 일정표는 (staff) 그룹의 다른 라우트(/inventory)와 달리 여전히 manager 이상 전용 —
// 상위 (staff)/layout.tsx가 세션 존재만 확인하므로 역할 검사는 여기서 담당한다.
export default async function RosterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const role = session?.user?.user_metadata?.role
  if (!session || (role !== 'admin' && role !== 'manager')) redirect('/pos');
  return <>{children}</>;
}
