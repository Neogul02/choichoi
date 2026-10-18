import { redirect } from 'next/navigation';
import { getAuthUser } from '@/app/actions/_base';

// 일정표는 (staff) 그룹의 다른 라우트(/inventory)와 달리 여전히 manager 이상 전용 —
// 상위 (staff)/layout.tsx가 세션 존재만 확인하므로 역할 검사는 여기서 담당한다.
export default async function RosterLayout({ children }: { children: React.ReactNode }) {
  // getSession()은 서버에서 쿠키를 서명 검증 없이 읽는다 — 검증된 클레임의 app_metadata.role로 판단
  const role = (await getAuthUser())?.role;
  if ((role !== 'admin' && role !== 'manager')) redirect('/pos');
  return <>{children}</>;
}
