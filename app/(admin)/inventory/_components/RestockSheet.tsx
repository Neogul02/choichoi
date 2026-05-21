'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Ingredient } from '@/types/database';
import { restockIngredient } from '@/app/actions';
import { totalQty } from '../_hooks/useInventory';

interface Props {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSuccess: () => void;
}

const QUICK_CHIPS = [1, 3, 5, 10];

export default function RestockSheet({ ingredient, onClose, onSuccess }: Props) {
  const [sealedDelta, setSealedDelta] = useState(1);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ingredient) { setSealedDelta(1); setNote(''); }
  }, [ingredient]);

  if (!ingredient) return null;

  const currentTotal = totalQty(ingredient);
  const afterTotal = currentTotal + sealedDelta * ingredient.container_size;

  function formatQty(qty: number, ing: Ingredient): string {
    if (ing.unit_type === 'weight') {
      return qty >= 1000 ? `${(qty / 1000).toFixed(1)}kg` : `${qty}g`;
    }
    return `${qty}${ing.base_unit}`;
  }

  async function handleConfirm() {
    if (!ingredient || sealedDelta < 1) return;
    setSaving(true);
    const res = await restockIngredient(ingredient.id, sealedDelta, 0, note || undefined);
    setSaving(false);
    if (res.success) {
      toast.success(`${ingredient.name} ${sealedDelta}${ingredient.container_unit} 입고 완료`);
      onSuccess();
      onClose();
    } else {
      toast.error(`입고 실패: ${res.error}`);
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
        onClick={onClose}
      >
        <motion.div
          key="sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-extrabold text-[#161616]">
              {ingredient.name} 입고
            </h2>
            <button
              onClick={onClose}
              className="text-[#aaa] hover:text-[#555] text-lg leading-none cursor-pointer transition"
            >
              ✕
            </button>
          </div>

          {/* 박스 수 */}
          <div className="mb-4">
            <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-2">
              입고 수량 ({ingredient.container_unit})
            </label>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setSealedDelta((v) => Math.max(1, v - 1))}
                className="w-9 h-9 rounded-full border border-[#e0e0e0] text-lg font-bold text-[#444] hover:bg-[#f5f6f7] cursor-pointer transition"
              >
                −
              </button>
              <span className="text-3xl font-black tabular-nums w-10 text-center">{sealedDelta}</span>
              <button
                onClick={() => setSealedDelta((v) => v + 1)}
                className="w-9 h-9 rounded-full border border-[#e0e0e0] text-lg font-bold text-[#444] hover:bg-[#f5f6f7] cursor-pointer transition"
              >
                +
              </button>
            </div>
            <div className="flex gap-1.5">
              {QUICK_CHIPS.map((n) => (
                <button
                  key={n}
                  onClick={() => setSealedDelta(n)}
                  className={`text-[11px] font-bold px-3 py-1 rounded-lg border-none cursor-pointer transition ${
                    sealedDelta === n
                      ? 'bg-primary-700 text-white'
                      : 'bg-[#f5f6f7] text-[#666] hover:bg-primary-50 hover:text-primary-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* 메모 */}
          <div className="mb-4">
            <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-2">
              메모 (선택)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 마켓컬리, 유통기한 6/30"
              className="w-full border border-[#ddd] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary-700 transition"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            />
          </div>

          {/* 프리뷰 */}
          <div className="bg-[#f9f9f9] rounded-xl px-3.5 py-2.5 mb-4 text-[12px] text-[#555]">
            입고 후 재고:{' '}
            <span className="font-bold text-[#161616]">{formatQty(afterTotal, ingredient)}</span>
            <span className="text-[#aaa] ml-1">
              (현재 {formatQty(currentTotal, ingredient)} + {sealedDelta}{ingredient.container_unit})
            </span>
          </div>

          <button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
          >
            {saving ? '저장 중…' : `${sealedDelta}${ingredient.container_unit} 입고 확정`}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
