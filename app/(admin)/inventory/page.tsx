'use client';

import { useState, useMemo } from 'react';
import NavBar from '@/components/NavBar';
import type { Ingredient } from '@/types/database';
import { useInventory, totalQty, getStatus } from './_hooks/useInventory';
import { useLiveLog } from './_hooks/useLiveLog';
import FilterBar, { type SortKey } from './_components/FilterBar';
import IngredientCard from './_components/IngredientCard';
import IngredientManageModal from './_components/IngredientManageModal';
import LiveLog from './_components/LiveLog';
import RecipePanel from './_components/RecipePanel';
import RecipeModal from './_components/RecipeModal';
import AddIngredientModal from './_components/AddIngredientModal';

interface MenuTarget {
  menu_id: number;
  menu_name: string;
}

export default function InventoryPage() {
  const { ingredients, recipes, isLoading, reload } = useInventory();
  const { logs, isLoading: logLoading } = useLiveLog();

  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortKey>('default');
  const [manageTarget, setManageTarget] = useState<Ingredient | null>(null);
  const [recipeTarget, setRecipeTarget] = useState<MenuTarget | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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
                  recipes={recipes}
                  onClick={() => setManageTarget(ing)}
                />
              ))}
            </div>
          )}

          <div className="bg-canvas rounded-2xl p-3.5 shadow-level-1">
            <LiveLog logs={logs} isLoading={logLoading} />
          </div>

          <div className="bg-canvas rounded-2xl p-3.5 shadow-level-1">
            <RecipePanel
              recipes={recipes}
              ingredients={ingredients}
              onSelectMenu={setRecipeTarget}
            />
          </div>

        </div>
      </main>

      <IngredientManageModal
        ingredient={manageTarget}
        onClose={() => setManageTarget(null)}
        onSuccess={reload}
      />

      <RecipeModal
        target={recipeTarget}
        recipes={recipes}
        ingredients={ingredients}
        onClose={() => setRecipeTarget(null)}
        onRefresh={reload}
      />

      <AddIngredientModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={reload}
      />
    </>
  );
}
