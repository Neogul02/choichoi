'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import NavBar from '@/components/NavBar';
import type { Ingredient, StorageObjectWithItems } from '@/types/database';
import { useInventory, totalQty, getStatus } from '../_hooks/useInventory';
import { useStorageBoard } from '../_hooks/useStorageBoard';
import { useCurrentRole } from '@/lib/useCurrentRole';
import { restockIngredient } from '@/app/actions/inventory';
import { updateStorageObjectPosition } from '@/app/actions/storage';
import FilterBar, { type SortKey } from './FilterBar';
import IngredientCard from './IngredientCard';
import IngredientManageModal from './IngredientManageModal';
import AddIngredientModal from './AddIngredientModal';
import StorageBoard from './StorageBoard';
import StorageObjectModal from './StorageObjectModal';
import AddStorageObjectModal from './AddStorageObjectModal';
import { InventoryGridSkeleton } from '@/components/Skeleton';

const SYNC_DEBOUNCE_MS = 700;
type Tab = 'board' | 'list';

interface Props {
  initialIngredients: Ingredient[] | null;
  initialStorageObjects: StorageObjectWithItems[] | null;
}

// 초기 재료/보관함 목록은 서버 컴포넌트(page.tsx)가 조회해 내려준다 — 마운트 후 왕복 제거
export default function InventoryPageClient({ initialIngredients, initialStorageObjects }: Props) {
  const { canEdit } = useCurrentRole();
  const { ingredients, isLoading, reload, applyLocalDelta } = useInventory(initialIngredients);
  const { objects, isLoading: boardLoading, reload: reloadBoard, applyLocalPosition } = useStorageBoard(initialStorageObjects);

  const [tab, setTab] = useState<Tab>('board');
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortKey>('default');
  const [manageTarget, setManageTarget] = useState<Ingredient | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [addObjectOpen, setAddObjectOpen] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

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

  const dashboard = useMemo(() => {
    const placedIds = new Set(objects.flatMap((o) => o.ingredient_ids));
    const unplacedCount = ingredients.filter((i) => !placedIds.has(i.id)).length;
    const lowStockCount = ingredients.filter((i) => {
      const s = getStatus(i);
      return s === 'out' || s === 'low';
    }).length;
    return {
      objectCount: objects.length,
      placedCount: placedIds.size,
      unplacedCount,
      lowStockCount,
    };
  }, [objects, ingredients]);

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
        setFailedIds((prev) => new Set(prev).add(id));
        reload();
      } else {
        setFailedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, SYNC_DEBOUNCE_MS);
  }, [reload]);

  const adjustSealed = useCallback((ing: Ingredient, delta: 1 | -1) => {
    if (!canEdit) return;
    applyLocalDelta(ing.id, delta, 0);
    setFailedIds((prev) => {
      if (!prev.has(ing.id)) return prev;
      const next = new Set(prev);
      next.delete(ing.id);
      return next;
    });
    const p = pendingRef.current[ing.id] ?? { sealed: 0, opened: 0 };
    pendingRef.current[ing.id] = { sealed: p.sealed + delta, opened: p.opened };
    scheduleSync(ing.id);
  }, [canEdit, applyLocalDelta, scheduleSync]);

  const adjustOpened = useCallback((ing: Ingredient, delta: 1 | -1) => {
    if (!canEdit) return;
    applyLocalDelta(ing.id, 0, delta);
    setFailedIds((prev) => {
      if (!prev.has(ing.id)) return prev;
      const next = new Set(prev);
      next.delete(ing.id);
      return next;
    });
    const p = pendingRef.current[ing.id] ?? { sealed: 0, opened: 0 };
    pendingRef.current[ing.id] = { sealed: p.sealed, opened: p.opened + delta };
    scheduleSync(ing.id);
  }, [canEdit, applyLocalDelta, scheduleSync]);

  const handleMoveObject = useCallback(async (id: string, posX: number, posY: number) => {
    applyLocalPosition(id, posX, posY);
    const res = await updateStorageObjectPosition(id, posX, posY);
    if (!res.success) {
      toast.error(`위치 저장 실패: ${res.error}`);
      reloadBoard();
    }
  }, [applyLocalPosition, reloadBoard]);

  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedObjectId) ?? null,
    [objects, selectedObjectId]
  );

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5">
        <div className="max-w-[1100px] mx-auto flex flex-col gap-3">

          {/* 대시보드 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-canvas rounded-xl border border-hairline px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-ink-faint">오브젝트</div>
              <div className="text-lg font-black text-ink tabular-nums">{dashboard.objectCount}개</div>
            </div>
            <div className="bg-canvas rounded-xl border border-hairline px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-ink-faint">배치된 재료</div>
              <div className="text-lg font-black text-ink tabular-nums">{dashboard.placedCount}종</div>
            </div>
            <div className="bg-canvas rounded-xl border border-hairline px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-ink-faint">미배치 재료</div>
              <div className="text-lg font-black text-ink tabular-nums">{dashboard.unplacedCount}종</div>
            </div>
            <div className="bg-canvas rounded-xl border border-hairline px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-ink-faint">재고부족</div>
              <div className="text-lg font-black text-rose-500 tabular-nums">{dashboard.lowStockCount}종</div>
            </div>
          </div>

          {/* 탭 전환 */}
          <div className="flex items-center justify-between px-0.5">
            <div className="flex bg-[#f5f6f7] rounded-xl p-1 gap-1">
              {([['board', '보관함'], ['list', '전체 목록']] as [Tab, string][]).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition border-none ${
                    tab === t ? 'bg-canvas text-ink shadow-sm' : 'bg-transparent text-ink-faint hover:text-ink-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {(isLoading || boardLoading) && <span className="text-[11px] text-ink-faint">불러오는 중…</span>}
              {tab === 'list' && canEdit && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="px-3.5 py-2 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition"
                >
                  + 재고 종류 추가
                </button>
              )}
            </div>
          </div>

          {tab === 'board' ? (
            <StorageBoard
              objects={objects}
              canEdit={canEdit}
              onSelect={(o) => setSelectedObjectId(o.id)}
              onMove={handleMoveObject}
              onAddClick={() => setAddObjectOpen(true)}
            />
          ) : (
            <>
              <FilterBar
                category={category}
                sort={sort}
                onCategoryChange={setCategory}
                onSortChange={setSort}
              />

              {isLoading && ingredients.length === 0 ? (
                <InventoryGridSkeleton />
              ) : filtered.length === 0 ? (
                <p className="text-[12px] text-ink-faint px-0.5">재료가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filtered.map((ing) => (
                    <IngredientCard
                      key={ing.id}
                      ingredient={ing}
                      onManage={() => canEdit && setManageTarget(ing)}
                      onIncreaseBox={() => adjustSealed(ing, 1)}
                      onDecreaseBox={() => adjustSealed(ing, -1)}
                      onIncreaseUnit={() => adjustOpened(ing, 1)}
                      onDecreaseUnit={() => adjustOpened(ing, -1)}
                      hasError={failedIds.has(ing.id)}
                      readOnly={!canEdit}
                    />
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </main>

      {canEdit && (
        <>
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

          <AddStorageObjectModal
            open={addObjectOpen}
            onClose={() => setAddObjectOpen(false)}
            onSuccess={reloadBoard}
          />
        </>
      )}

      <StorageObjectModal
        object={selectedObject}
        ingredients={ingredients}
        canEdit={canEdit}
        onClose={() => setSelectedObjectId(null)}
        onSuccess={reloadBoard}
      />
    </>
  );
}
