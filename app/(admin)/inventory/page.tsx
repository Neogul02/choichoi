'use client';

import { useState, useMemo } from 'react';
import NavBar from '@/components/NavBar';
import type { Ingredient } from '@/types/database';
import { useInventory, totalQty, getStatus } from './_hooks/useInventory';
import { useLiveLog } from './_hooks/useLiveLog';
import LowStockAlert from './_components/LowStockAlert';
import MakeableHero from './_components/MakeableHero';
import StatusStrip from './_components/StatusStrip';
import FilterBar, { type SortKey } from './_components/FilterBar';
import IngredientCard from './_components/IngredientCard';
import LiveLog from './_components/LiveLog';
import RecipePanel from './_components/RecipePanel';
import RestockSheet from './_components/RestockSheet';

export default function InventoryPage() {
  const { ingredients, recipes, makeable, isLoading, reload } = useInventory();
  const { logs, isLoading: logLoading } = useLiveLog();

  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortKey>('default');
  const [restockTarget, setRestockTarget] = useState<Ingredient | null>(null);

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

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5">
        <div className="max-w-[860px] mx-auto flex flex-col gap-3">

          {/* 헤더 */}
          <div className="flex items-center gap-2 px-0.5">
            <h2 className="text-xl font-extrabold text-[#161616]">재고</h2>
            {isLoading && <span className="text-[11px] text-[#bbb]">불러오는 중…</span>}
          </div>

          <LowStockAlert ingredients={ingredients} onRestock={setRestockTarget} />

          <MakeableHero makeable={makeable} />

          <StatusStrip ingredients={ingredients} />

          <FilterBar
            category={category}
            sort={sort}
            onCategoryChange={setCategory}
            onSortChange={setSort}
          />

          {/* 재료 카드 그리드 */}
          {filtered.length === 0 && !isLoading ? (
            <p className="text-[12px] text-[#bbb] px-0.5">재료가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((ing) => (
                <IngredientCard
                  key={ing.id}
                  ingredient={ing}
                  recipes={recipes}
                  onRestock={() => setRestockTarget(ing)}
                  onRefresh={reload}
                />
              ))}
            </div>
          )}

          {/* 차감 로그 */}
          <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <LiveLog logs={logs} isLoading={logLoading} />
          </div>

          {/* 레시피 관리 */}
          <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <RecipePanel recipes={recipes} ingredients={ingredients} onRefresh={reload} />
          </div>

        </div>
      </main>

      <RestockSheet
        ingredient={restockTarget}
        onClose={() => setRestockTarget(null)}
        onSuccess={reload}
      />
    </>
  );
}
