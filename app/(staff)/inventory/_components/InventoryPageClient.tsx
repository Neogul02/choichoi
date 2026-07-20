'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import NavBar from '@/components/NavBar';
import type { Ingredient } from '@/types/database';
import { useInventory, totalQty, getStatus } from '../_hooks/useInventory';
import { restockIngredient } from '@/app/actions/inventory';
import FilterBar, { type SortKey } from './FilterBar';
import IngredientCard from './IngredientCard';
import IngredientManageModal from './IngredientManageModal';
import AddIngredientModal from './AddIngredientModal';

const SYNC_DEBOUNCE_MS = 700;

// 초기 재료 목록은 서버 컴포넌트(page.tsx)가 조회해 내려준다 — 마운트 후 왕복 제거
export default function InventoryPageClient({ initialIngredients }: { initialIngredients: Ingredient[] | null }) {
  const { ingredients, isLoading, reload, applyLocalDelta } = useInventory(initialIngredients);

  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortKey>('default');
  const [manageTarget, setManageTarget] = useState<Ingredient | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const pendingRef = useRef<Record<string, { sealed: number; opened: number }>>({});
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = timerRef.current;
    const pending = pendingRef.current;
    return () => {
      // 페이지를 벗어나도 디바운스 대기 중이던 변경분은 유실되지 않도록 즉시 전송
      Object.keys(timers).forEach((id) => clearTimeout(timers[id]));
      Object.entries(pending).forEach(([id, delta]) => {
        if (delta.sealed !== 0 || delta.opened !== 0) restockIngredient(id, delta.sealed, delta.opened);
      });
    };
  }, []);

  const filtered = useMemo(() => {
    let list = category === '전체' ? ingredients : ingredients.filter((i) => i.category === category);
    if (sort === 'qty_asc') {
      list = [...list].sort((a, b) => totalQty(a) - totalQty(b));
    } else if (sort === 'status') {
      const order = { out: 0, low: 1, warn: 2, ok: 3 };
      list = [...list].sort((a, b) => order[getStatus(a)] - order[getStatus(b)]);
    }
    return list;
  }, [ingredients, category, sort]);

  const scheduleSync = useCallback((id: string) => {
    if (timerRef.current[id]) clearTimeout(timerRef.current[id]);
    timerRef.current[id] = setTimeout(async () => {
      delete timerRef.current[id];
      const delta = pendingRef.current[id];
      delete pendingRef.current[id];
      if (!delta || (delta.sealed === 0 && delta.opened === 0)) return;
      const res = await restockIngredient(id, delta.sealed, delta.opened);
      if (!res.success) {
        toast.error(`재고 변경 실패: ${res.error}`);
        reload();
      }
    }, SYNC_DEBOUNCE_MS);
  }, [reload]);

  const adjustSealed = useCallback((ing: Ingredient, delta: 1 | -1) => {
    applyLocalDelta(ing.id, delta, 0);
    const p = pendingRef.current[ing.id] ?? { sealed: 0, opened: 0 };
    pendingRef.current[ing.id] = { sealed: p.sealed + delta, opened: p.opened };
    scheduleSync(ing.id);
  }, [applyLocalDelta, scheduleSync]);

  const adjustOpened = useCallback((ing: Ingredient, delta: 1 | -1) => {
    applyLocalDelta(ing.id, 0, delta);
    const p = pendingRef.current[ing.id] ?? { sealed: 0, opened: 0 };
    pendingRef.current[ing.id] = { sealed: p.sealed, opened: p.opened + delta };
    scheduleSync(ing.id);
  }, [applyLocalDelta, scheduleSync]);

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5">
        <div className="max-w-[860px] mx-auto flex flex-col gap-3">

          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-ink">재고</h2>
              {isLoading && <span className="text-[11px] text-ink-faint">불러오는 중…</span>}
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="text-[12px] font-bold px-3 py-1.5 rounded-xl bg-primary-700 text-white hover:bg-primary-800 cursor-pointer border-none transition"
            >
              + 재고 종류 추가
            </button>
          </div>

          <FilterBar
            category={category}
            sort={sort}
            onCategoryChange={setCategory}
            onSortChange={setSort}
          />

          {filtered.length === 0 && !isLoading ? (
            <p className="text-[12px] text-ink-faint px-0.5">재료가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((ing) => (
                <IngredientCard
                  key={ing.id}
                  ingredient={ing}
                  onManage={() => setManageTarget(ing)}
                  onIncreaseBox={() => adjustSealed(ing, 1)}
                  onDecreaseBox={() => adjustSealed(ing, -1)}
                  onIncreaseUnit={() => adjustOpened(ing, 1)}
                  onDecreaseUnit={() => adjustOpened(ing, -1)}
                />
              ))}
            </div>
          )}

        </div>
      </main>

      <IngredientManageModal
        ingredient={manageTarget}
        onClose={() => setManageTarget(null)}
        onSuccess={reload}
      />

      <AddIngredientModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={reload}
      />
    </>
  );
}
