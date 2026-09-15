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
import EmptyState from '@/components/EmptyState';

const SYNC_DEBOUNCE_MS = 700;

interface Props {
  initialIngredients: Ingredient[] | null;
  initialStorageObjects: StorageObjectWithItems[] | null;
}

// 초기 재료/보관함 목록은 서버 컴포넌트(page.tsx)가 조회해 내려준다 — 마운트 후 왕복 제거
export default function InventoryPageClient({ initialIngredients, initialStorageObjects }: Props) {
  const { canEdit } = useCurrentRole();
  const { ingredients, isLoading, reload, applyLocalDelta } = useInventory(initialIngredients);
  const { objects, isLoading: boardLoading, reload: reloadBoard, applyLocalPosition } = useStorageBoard(initialStorageObjects);

  const [sort, setSort] = useState<SortKey>('default');
  const [search, setSearch] = useState('');
  const [manageTarget, setManageTarget] = useState<Ingredient | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [addObjectOpen, setAddObjectOpen] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const pendingRef = useRef<Record<string, number>>({});
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = timerRef.current;
    const pending = pendingRef.current;
    return () => {
      // 페이지를 벗어나도 디바운스 대기 중이던 변경분은 유실되지 않도록 즉시 전송
      Object.keys(timers).forEach((id) => clearTimeout(timers[id]));
      Object.entries(pending).forEach(([id, delta]) => {
        if (delta !== 0) restockIngredient(id, delta);
      });
    };
  }, []);

  const filtered = useMemo(() => {
    let list = ingredients;
    // 검색은 정렬보다 먼저 — 공백·대소문자 무시하고 이름 부분일치
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    if (sort === 'qty_asc') {
      list = [...list].sort((a, b) => totalQty(a) - totalQty(b));
    } else if (sort === 'status') {
      const order = { out: 0, low: 1, warn: 2, ok: 3 };
      list = [...list].sort((a, b) => order[getStatus(a)] - order[getStatus(b)]);
    }
    return list;
  }, [ingredients, sort, search]);

  const scheduleSync = useCallback((id: string) => {
    if (timerRef.current[id]) clearTimeout(timerRef.current[id]);
    timerRef.current[id] = setTimeout(async () => {
      delete timerRef.current[id];
      const delta = pendingRef.current[id];
      delete pendingRef.current[id];
      if (!delta) return;
      const res = await restockIngredient(id, delta);
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

  const adjustCount = useCallback((ing: Ingredient, delta: number) => {
    if (!canEdit) return;
    applyLocalDelta(ing.id, delta);
    setFailedIds((prev) => {
      if (!prev.has(ing.id)) return prev;
      const next = new Set(prev);
      next.delete(ing.id);
      return next;
    });
    pendingRef.current[ing.id] = (pendingRef.current[ing.id] ?? 0) + delta;
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

          {/* 보관함 시각 영역 */}
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-[13px] font-extrabold text-ink">보관함</h2>
            {(isLoading || boardLoading) && <span className="text-[11px] text-ink-faint">불러오는 중…</span>}
          </div>

          <StorageBoard
            objects={objects}
            ingredients={ingredients}
            canEdit={canEdit}
            onSelect={(o) => setSelectedObjectId(o.id)}
            onMove={handleMoveObject}
            onAddClick={() => setAddObjectOpen(true)}
          />

          {/* 전체 재료 목록 — 맨 아래 */}
          <div className="flex items-center justify-between px-0.5 mt-2">
            <h2 className="text-[13px] font-extrabold text-ink">전체 재료 목록</h2>
            {canEdit && (
              <button
                onClick={() => setAddOpen(true)}
                className="px-3.5 py-2 rounded-xl border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition"
              >
                + 재고 종류 추가
              </button>
            )}
          </div>

          <FilterBar sort={sort} onSortChange={setSort} search={search} onSearchChange={setSearch} />

          {isLoading && ingredients.length === 0 ? (
            <InventoryGridSkeleton />
          ) : filtered.length === 0 ? (
            search.trim() ? (
              <EmptyState
                icon="🔍"
                title={`'${search.trim()}'에 맞는 재료가 없습니다`}
                description="이름 일부만 입력해도 찾을 수 있습니다."
                actionLabel="검색 지우기"
                onAction={() => setSearch('')}
              />
            ) : (
              <EmptyState
                icon="📦"
                title="등록된 재료가 없습니다"
                description={canEdit
                  ? '재고 종류를 추가하면 여기에서 수량을 바로 조절할 수 있습니다.'
                  : '관리자가 재고 종류를 등록하면 여기에 표시됩니다.'}
                actionLabel={canEdit ? '+ 재고 종류 추가' : undefined}
                onAction={canEdit ? () => setAddOpen(true) : undefined}
              />
            )
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
              {filtered.map((ing) => (
                <IngredientCard
                  key={ing.id}
                  ingredient={ing}
                  onManage={() => canEdit && setManageTarget(ing)}
                  onAdjust={(delta) => adjustCount(ing, delta)}
                  hasError={failedIds.has(ing.id)}
                  readOnly={!canEdit}
                />
              ))}
            </div>
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
        onAdjust={(ing, delta) => adjustCount(ing, delta)}
        failedIds={failedIds}
      />
    </>
  );
}
