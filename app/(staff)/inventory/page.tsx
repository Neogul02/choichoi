import { fetchIngredients } from '@/app/actions/inventory';
import InventoryPageClient from './_components/InventoryPageClient';

// 초기 재료 목록을 서버에서 조회해 내려준다 — 클라이언트 마운트 후 왕복 제거 (hr 패턴)
export default async function InventoryPage() {
  const res = await fetchIngredients();
  return <InventoryPageClient initialIngredients={res.success ? res.data ?? [] : null} />;
}
