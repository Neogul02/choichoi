import { redirect } from 'next/navigation';
import { getAuthUser } from '@/app/actions/_base';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // getSession()은 서버에서 쿠키를 서명 검증 없이 읽는다 — 검증된 클레임의 app_metadata.role로 판단
  const role = (await getAuthUser())?.role;
  if (role !== 'admin') redirect('/pos');
  return <>{children}</>;
}
