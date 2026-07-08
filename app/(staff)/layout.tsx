import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  const role = session?.user?.user_metadata?.role
  if (!session || (role !== 'admin' && role !== 'manager')) redirect('/pos');
  return <>{children}</>;
}
