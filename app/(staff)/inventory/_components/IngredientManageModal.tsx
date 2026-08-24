'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Ingredient } from '@/types/database';
import { updateIngredientSettings, setPhysicalInventory, deleteIngredientById } from '@/app/actions/inventory';
import { totalQty } from '../_hooks/useInventory';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';
import ConfirmDialog from '@/components/ConfirmDialog';

interface Props {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'adjust' | 'settings';

export default function IngredientManageModal({ ingredient, onClose, onSuccess }: Props) {
  useBodyScrollLock(ingredient != null);
  const [tab, setTab] = useState<Tab>('adjust');
  const [reorderAt, setReorderAt] = useState('');
  const [vendor, setVendor] = useState('');
  const [adjTotal, setAdjTotal] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ingredient) {
      setTab('adjust');
      setReorderAt(String(ingredient.reorder_at));
      setVendor(ingredient.vendor ?? '');
      setAdjTotal(String(ingredient.total_count));
      setConfirmDelete(false);
    }
  }, [ingredient]);

  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: ingredient != null, onClose, containerRef: panelRef });

  if (!ingredient) return null;

  const currentTotal = totalQty(ingredient);

  function fmt(qty: number): string {
    if (ingredient!.unit_type === 'weight') {
      return qty >= 1000 ? `${(qty / 1000).toFixed(1)}kg` : `${qty}g`;
    }
    return `${qty}${ingredient!.base_unit}`;
  }

  async function handleAdjust() {
    const t = parseFloat(adjTotal);
    if (isNaN(t) || t < 0) {
      toast.error('올바른 값을 입력해주세요');
      return;
    }
    setSaving(true);
    const res = await setPhysicalInventory(ingredient!.id, t);
    setSaving(false);
    if (res.success) {
      toast.success('재고 조정 완료');
      onSuccess();
      onClose();
    } else {
      toast.error(`조정 실패: ${res.error}`);
    }
  }

  async function handleDelete() {
    setSaving(true);
    const res = await deleteIngredientById(ingredient!.id);
    setSaving(false);
    if (res.success) {
      toast.success(`${ingredient!.name} 삭제 완료`);
      onSuccess();
      onClose();
    } else {
      toast.error(`삭제 실패: ${res.error}`);
    }
  }

  async function handleSettings() {
    const ra = parseFloat(reorderAt);
    if (isNaN(ra) || ra < 0) {
      toast.error('올바른 값을 입력해주세요');
      return;
    }
    setSaving(true);
    const res = await updateIngredientSettings(ingredient.id, {
      reorder_at: ra,
      vendor: vendor.trim() || null,
    });
    setSaving(false);
    if (res.success) {
      toast.success('설정 저장 완료');
      onSuccess();
      onClose();
    } else {
      toast.error(`저장 실패: ${res.error}`);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      >
        <motion.div
          key="modal"
          ref={panelRef}
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="bg-canvas w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-[15px] font-extrabold text-ink">{ingredient.name}</h2>
              <p className="text-[11px] text-ink-faint mt-0.5">현재 {fmt(currentTotal)}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-ink-faint hover:text-ink-muted text-xl leading-none cursor-pointer transition"
            >
              ✕
            </button>
          </div>

          {/* 탭 */}
          <div className="flex mx-5 mb-4 bg-[#f5f6f7] rounded-xl p-1 gap-1">
            {(['adjust', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition border-none ${
                  tab === t
                    ? 'bg-canvas text-ink shadow-sm'
                    : 'bg-transparent text-ink-faint hover:text-ink-muted'
                }`}
              >
                {t === 'adjust' ? '재고 조정' : '설정'}
              </button>
            ))}
          </div>

          <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {tab === 'adjust' && (
              <form onSubmit={(e) => { e.preventDefault(); handleAdjust(); }} className="flex flex-col gap-4">
                <p className="text-[11px] text-ink-faint">실사 결과를 직접 입력합니다. 현재 재고가 이 값으로 덮어써집니다. 카드의 +/- 버튼으로도 빠르게 조정할 수 있습니다.</p>
                <div>
                  <label className="text-[10px] font-bold text-ink-muted block mb-1.5">
                    재고 수량 ({ingredient.base_unit})
                  </label>
                  <input
                    type="number"
                    value={adjTotal}
                    onChange={(e) => setAdjTotal(e.target.value)}
                    className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    min={0}
                  />
                </div>

                <div className="bg-canvas-soft rounded-xl px-3.5 py-2.5 text-[11px] text-ink-muted">
                  조정 후: <span className="font-bold text-ink">{fmt(parseFloat(adjTotal) || 0)}</span>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
                >
                  {saving ? '저장 중…' : '재고 조정 확정'}
                </button>
              </form>
            )}

            {tab === 'settings' && (
              <form onSubmit={(e) => { e.preventDefault(); handleSettings(); }} className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-bold text-ink-muted block mb-1.5">
                    발주 기준 수량 ({ingredient.base_unit})
                  </label>
                  <input
                    type="number"
                    value={reorderAt}
                    onChange={(e) => setReorderAt(e.target.value)}
                    className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    min={0}
                  />
                </div>

                <div className="bg-canvas-soft rounded-xl px-3.5 py-2.5 text-[11px] text-ink-muted">
                  재고가 이 수량 이하로 떨어지면 &quot;발주&quot; 상태로 표시됩니다.
                </div>

                <div>
                  <label className="text-[10px] font-bold text-ink-muted block mb-1.5">거래처 (선택)</label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="예: 마켓컬리 010-1234-5678"
                    className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
                >
                  {saving ? '저장 중…' : '설정 저장'}
                </button>

                <div className="border-t border-hairline pt-3">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full text-rose-500 text-[12px] font-bold py-2 rounded-xl cursor-pointer border border-rose-200 hover:bg-rose-50 transition"
                  >
                    이 재고 종류 삭제
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>

      <ConfirmDialog
        open={confirmDelete}
        title={`${ingredient.name}을(를) 삭제합니다`}
        description="복구 불가."
        confirmLabel="삭제"
        danger
        busy={saving}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </AnimatePresence>
  );
}
