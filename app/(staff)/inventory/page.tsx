import { fetchIngredients } from '@/app/actions/inventory';
import { fetchStorageBoard } from '@/app/actions/storage';
import InventoryPageClient from './_components/InventoryPageClient';

// 초기 재료 목록 + 보관함 오브젝트를 서버에서 함께 조회해 내려준다 — 클라이언트 마운트 후 왕복 제거 (hr 패턴)
export default async function InventoryPage() {
  const [ingredientsRes, boardRes] = await Promise.all([fetchIngredients(), fetchStorageBoard()]);
  return (
    <InventoryPageClient
      initialIngredients={ingredientsRes.success ? ingredientsRes.data ?? [] : null}
      initialStorageObjects={boardRes.success ? boardRes.data ?? [] : null}
    />
  );
}
