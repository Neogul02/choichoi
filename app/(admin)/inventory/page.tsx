'use client';

import { useState, useMemo } from 'react';
import NavBar from '@/components/NavBar';
import { motion } from 'framer-motion';
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
        <div className="max-w-[860px] mx-auto flex flex-col gap-3 md:gap-4">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="flex items-center gap-3 px-1"
          >
            <h2 className="text-2xl font-extrabold text-[#161616]">재고</h2>
            {isLoading && (
              <span className="text-xs text-[#bbb]">불러오는 중…</span>
            )}
          </motion.div>

          <LowStockAlert ingredients={ingredients} onRestock={setRestockTarget} />

          <MakeableHero makeable={makeable} />

          <StatusStrip ingredients={ingredients} />

          <FilterBar
            category={category}
            sort={sort}
            onCategoryChange={setCategory}
            onSortChange={setSort}
          />

          {filtered.length === 0 && !isLoading && (
            <p className="text-sm text-[#bbb] px-1">재료가 없습니다.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((ing) => (
              <IngredientCard
                key={ing.id}
                ingredient={ing}
                recipes={recipes}
                onRestock={() => setRestockTarget(ing)}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
            <LiveLog logs={logs} isLoading={logLoading} />
          </div>

          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
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
