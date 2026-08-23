'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Ingredient, StorageObjectWithItems } from '@/types/database';
import { getStatus, type IngredientStatus } from '../_hooks/useInventory';
import { addIngredientToObject, removeIngredientFromObject, renameStorageObject, deleteStorageObject } from '@/app/actions/storage';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';
import ConfirmDialog from '@/components/ConfirmDialog';
import { storageIconMeta } from './storageIcons';

interface Props {
  object: StorageObjectWithItems | null;
  ingredients: Ingredient[];
  canEdit: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STATUS_LABELS: Record<IngredientStatus, string> = {
  out: '재고없음', low: '발주필요', warn: '주의', ok: '정상',
};
const STATUS_CHIP: Record<IngredientStatus, string> = {
  out: 'bg-rose-100 text-rose-600',
  low: 'bg-rose-100 text-rose-600',
  warn: 'bg-amber-100 text-amber-600',
  ok: 'bg-emerald-100 text-emerald-600',
};

export default function StorageObjectModal({ object, ingredients, canEdit, onClose, onSuccess }: Props) {
  useBodyScrollLock(object != null);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: object != null, onClose, containerRef: panelRef });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (object) {
      setPickerOpen(false);
      setSearch('');
      setRenaming(false);
      setNameDraft(object.name);
      setConfirmDelete(false);
    }
  }, [object]);

  const linkedIngredients = useMemo(() => {
    if (!object) return [];
    const set = new Set(object.ingredient_ids);
    return ingredients.filter((i) => set.has(i.id));
  }, [object, ingredients]);

  const candidates = useMemo(() => {
    if (!object) return [];
    const set = new Set(object.ingredient_ids);
    const q = search.trim();
    return ingredients.filter((i) => !set.has(i.id) && (q === '' || i.name.includes(q)));
  }, [object, ingredients, search]);

  const meta = object ? storageIconMeta(object.icon) : null;

  async function handleAdd(ingredientId: string) {
    setBusyId(ingredientId);
    const res = await addIngredientToObject(object!.id, ingredientId);
    setBusyId(null);
    if (res.success) onSuccess();
    else toast.error(`추가 실패: ${res.error}`);
  }

  async function handleRemove(ingredientId: string) {
    setBusyId(ingredientId);
    const res = await removeIngredientFromObject(object!.id, ingredientId);
    setBusyId(null);
    if (res.success) onSuccess();
    else toast.error(`삭제 실패: ${res.error}`);
  }

  async function handleRename() {
    const name = nameDraft.trim();
    if (!name) { toast.error('이름을 입력해주세요'); return; }
    setSaving(true);
    const res = await renameStorageObject(object!.id, name);
    setSaving(false);
    if (res.success) { setRenaming(false); onSuccess(); }
    else toast.error(`이름 변경 실패: ${res.error}`);
  }

  async function handleDelete() {
    setSaving(true);
    const res = await deleteStorageObject(object!.id);
    setSaving(false);
    if (res.success) {
      toast.success(`${object!.name} 삭제 완료`);
      onSuccess();
      onClose();
    } else {
      toast.error(`삭제 실패: ${res.error}`);
    }
  }

  return (
    <AnimatePresence>
      {object && meta && (
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          ref={panelRef}
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="bg-canvas w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            {renaming ? (
              <form onSubmit={(e) => { e.preventDefault(); handleRename(); }} className="flex items-center gap-2 flex-1 mr-2">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="flex-1 border border-hairline rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-primary-700 transition"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
                <button type="submit" disabled={saving} className="text-[12px] font-bold text-primary-700 cursor-pointer border-none bg-transparent disabled:opacity-50">저장</button>
                <button type="button" onClick={() => setRenaming(false)} className="text-[12px] text-ink-faint cursor-pointer border-none bg-transparent">취소</button>
              </form>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl leading-none">{meta.emoji}</span>
                <h2 className="text-[15px] font-extrabold text-ink truncate">{object.name}</h2>
                {canEdit && (
                  <button type="button" onClick={() => setRenaming(true)} aria-label="이름 변경" className="text-ink-faint hover:text-ink-muted text-[11px] cursor-pointer border-none bg-transparent">✎</button>
                )}
              </div>
            )}
            <button type="button" onClick={onClose} aria-label="닫기" className="text-ink-faint hover:text-ink-muted text-xl leading-none cursor-pointer transition shrink-0">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
            {linkedIngredients.length === 0 ? (
              <p className="text-[12px] text-ink-faint py-2">담긴 재료가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {linkedIngredients.map((ing) => {
                  const status = getStatus(ing);
                  return (
                    <li key={ing.id} className="flex items-center justify-between gap-2 bg-canvas-soft rounded-xl px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12px] font-bold text-ink truncate">{ing.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_CHIP[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemove(ing.id)}
                          disabled={busyId === ing.id}
                          aria-label={`${ing.name} 제거`}
                          className="text-ink-faint hover:text-rose-500 text-sm leading-none cursor-pointer border-none bg-transparent disabled:opacity-40 shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canEdit && (
              <div className="flex flex-col gap-2 border-t border-hairline pt-3">
                {!pickerOpen ? (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="w-full py-2 rounded-xl text-[12px] font-bold cursor-pointer border border-dashed border-hairline text-ink-muted hover:bg-primary-50 hover:text-primary-700 transition"
                  >
                    + 재료 추가
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="재료 이름 검색"
                      className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    />
                    {candidates.length === 0 ? (
                      <p className="text-[11px] text-ink-faint px-1 py-1">검색 결과가 없습니다.</p>
                    ) : (
                      <ul className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                        {candidates.map((ing) => (
                          <li key={ing.id}>
                            <button
                              type="button"
                              onClick={() => handleAdd(ing.id)}
                              disabled={busyId === ing.id}
                              className="w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold text-ink hover:bg-primary-50 hover:text-primary-700 cursor-pointer border-none bg-canvas-soft transition disabled:opacity-40"
                            >
                              {ing.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" onClick={() => { setPickerOpen(false); setSearch(''); }} className="text-[11px] text-ink-faint self-start cursor-pointer border-none bg-transparent">닫기</button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-rose-500 text-[12px] font-bold py-2 rounded-xl cursor-pointer border border-rose-200 hover:bg-rose-50 transition"
                >
                  이 오브젝트 삭제
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
      )}

      {object && (
        <ConfirmDialog
          open={confirmDelete}
          title={`${object.name}을(를) 삭제합니다`}
          description="담긴 재료 연결 정보도 함께 삭제되며 복구할 수 없습니다. (재료 자체는 삭제되지 않습니다)"
          confirmLabel="삭제"
          danger
          busy={saving}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </AnimatePresence>
  );
}
