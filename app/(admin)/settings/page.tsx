import { getAllMenu } from '@/app/actions/menu';
import SettingsPageClient from './_components/SettingsPageClient';

// 정적 프리렌더 방지 — 요청마다 최신 메뉴를 조회해 내려준다 (hr 패턴)
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const res = await getAllMenu();
  return <SettingsPageClient initialMenuItems={res.success ? res.data ?? [] : null} />;
}
