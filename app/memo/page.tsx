import { fetchAllMemos } from '@/app/actions/memos';
import MemoPageClient from './MemoPageClient';

// 정적 프리렌더 방지 — 빌드 시점 메모가 initialData로 고정되는 것을 막고 요청마다 조회
export const dynamic = 'force-dynamic';

// 초기 메모 목록을 서버에서 조회해 내려준다 — 클라이언트 마운트 후 왕복 제거 (hr 패턴)
export default async function MemoPage() {
  const res = await fetchAllMemos();
  return <MemoPageClient initialMemos={res.success ? res.data ?? [] : null} />;
}
