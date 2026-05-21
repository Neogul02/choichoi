'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Ingredient } from '@/types/database';
import { restockIngredient, updateIngredientSettings } from '@/app/actions';
import { totalQty } from '../_hooks/useInventory';

interface Props {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSuccess: () => void;
}

type Tab = 'restock' | 'settings';
const QUICK_CHIPS = [1, 3, 5, 10];

export default function IngredientManageModal({ ingredient, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<Tab>('restock');
  const [sealedDelta, setSealedDelta] = useState(1);
  const [note, setNote] = useState('');
  const [containerSize, setContainerSize] = useState('');
  const [reorderAt, setReorderAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ingredient) {
      setTab('restock');
      setSealedDelta(1);
      setNote('');
      setContainerSize(String(ingredient.container_size));
      setReorderAt(String(ingredient.reorder_at_containers));
    }
  }, [ingredient]);

  if (!ingredient) return null;

  const currentTotal = totalQty(ingredient);
  const afterTotal = currentTotal + sealedDelta * ingredient.container_size;

  function fmt(qty: number): string {
    if (ingredient.unit_type === 'weight') {
      return qty >= 1000 ? `${(qty / 1000).toFixed(1)}kg` : `${qty}g`;
    }
    return `${qty}${ingredient.base_unit}`;
  }

  async function handleRestock() {
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

  async function handleSettings() {
    const cs = parseFloat(containerSize);
    const ro = parseInt(reorderAt, 10);
    if (isNaN(cs) || cs <= 0 || isNaN(ro) || ro < 0) {
      toast.error('올바른 값을 입력해주세요');
      return;
    }
    setSaving(true);
    const res = await updateIngredientSettings(ingredient.id, {
      container_size: cs,
      reorder_at_containers: ro,
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
        onClick={onClose}
      >
        <motion.div
          key="modal"
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-[15px] font-extrabold text-[#161616]">{ingredient.name}</h2>
              <p className="text-[11px] text-[#aaa] mt-0.5">
                현재 {fmt(currentTotal)} · 1{ingredient.container_unit}={ingredient.container_size}{ingredient.base_unit}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[#bbb] hover:text-[#555] text-xl leading-none cursor-pointer transition"
            >
              ✕
            </button>
          </div>

          {/* 탭 */}
          <div className="flex mx-5 mb-4 bg-[#f5f6f7] rounded-xl p-1 gap-1">
            {(['restock', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition border-none ${
                  tab === t
                    ? 'bg-white text-[#161616] shadow-sm'
                    : 'bg-transparent text-[#aaa] hover:text-[#666]'
                }`}
              >
                {t === 'restock' ? '입고 등록' : '설정'}
              </button>
            ))}
          </div>

          <div className="px-5 pb-5">
            {tab === 'restock' && (
              <div className="flex flex-col gap-4">
                {/* 수량 선택 */}
                <div>
                  <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-2">
                    입고 수량 ({ingredient.container_unit})
                  </label>
                  <div className="flex items-center justify-center gap-4 mb-3">
                    <button
                      onClick={() => setSealedDelta((v) => Math.max(1, v - 1))}
                      className="w-9 h-9 rounded-full border border-[#e0e0e0] text-lg font-bold text-[#444] hover:bg-[#f5f6f7] cursor-pointer transition"
                    >−</button>
                    <span className="text-3xl font-black tabular-nums w-10 text-center">{sealedDelta}</span>
                    <button
                      onClick={() => setSealedDelta((v) => v + 1)}
                      className="w-9 h-9 rounded-full border border-[#e0e0e0] text-lg font-bold text-[#444] hover:bg-[#f5f6f7] cursor-pointer transition"
                    >+</button>
                  </div>
                  <div className="flex gap-1.5 justify-center">
                    {QUICK_CHIPS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setSealedDelta(n)}
                        className={`text-[11px] font-bold px-3 py-1 rounded-lg border-none cursor-pointer transition ${
                          sealedDelta === n
                            ? 'bg-primary-700 text-white'
                            : 'bg-[#f5f6f7] text-[#666] hover:bg-primary-50 hover:text-primary-700'
                        }`}
                      >{n}</button>
                    ))}
                  </div>
                </div>

                {/* 메모 */}
                <div>
                  <label className="text-[10px] font-bold text-[#888] uppercase tracking-wide block mb-1.5">
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
                <div className="bg-[#f9f9f9] rounded-xl px-3.5 py-2.5 text-[12px] text-[#555]">
                  입고 후 재고:{' '}
                  <span className="font-bold text-[#161616]">{fmt(afterTotal)}</span>
                  <span className="text-[#aaa] ml-1">
                    (+{sealedDelta}{ingredient.container_unit})
                  </span>
                </div>

                <button
                  onClick={handleRestock}
                  disabled={saving}
                  className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
                >
                  {saving ? '저장 중…' : `${sealedDelta}${ingredient.container_unit} 입고 확정`}
                </button>
              </div>
            )}

            {tab === 'settings' && (
              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[#888] block mb-1.5">
                      1{ingredient.container_unit}당 {ingredient.base_unit} 수
                    </label>
                    <input
                      type="number"
                      value={containerSize}
                      onChange={(e) => setContainerSize(e.target.value)}
                      className="w-full border border-[#ddd] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                      min={1}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[#888] block mb-1.5">
                      발주 기준 ({ingredient.container_unit})
                    </label>
                    <input
                      type="number"
                      value={reorderAt}
                      onChange={(e) => setReorderAt(e.target.value)}
                      className="w-full border border-[#ddd] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                      min={0}
                    />
                  </div>
                </div>

                <div className="bg-[#f9f9f9] rounded-xl px-3.5 py-2.5 text-[11px] text-[#888]">
                  1{ingredient.container_unit} = {containerSize || '?'}{ingredient.base_unit} ·{' '}
                  {reorderAt || '?'}{ingredient.container_unit} 이하면 발주 알림
                </div>

                <button
                  onClick={handleSettings}
                  disabled={saving}
                  className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
                >
                  {saving ? '저장 중…' : '설정 저장'}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
