'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { Ingredient, Recipe } from '@/types/database';
import { saveRecipe, removeRecipe } from '@/app/actions';

interface MenuTarget {
  menu_id: number;
  menu_name: string;
}

interface Props {
  target: MenuTarget | null;
  recipes: Recipe[];
  ingredients: Ingredient[];
  onClose: () => void;
  onRefresh: () => void;
}

export default function RecipeModal({ target, recipes, ingredients, onClose, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [addIngId, setAddIngId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');

  if (!target) return null;

  const menuRecipes = recipes.filter((r) => r.menu_id === target.menu_id);
  const usedIds = new Set(menuRecipes.map((r) => r.ingredient_id));
  const available = ingredients.filter((i) => !usedIds.has(i.id));
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  async function handleAdd() {
    const qty = parseFloat(addQty);
    if (!addIngId || isNaN(qty) || qty <= 0) {
      toast.error('재료와 수량을 입력하세요');
      return;
    }
    setSaving(true);
    const res = await saveRecipe(target.menu_id, addIngId, qty);
    setSaving(false);
    if (res.success) {
      toast.success('재료 추가');
      setAddIngId('');
      setAddQty('');
      onRefresh();
    } else {
      toast.error(`추가 실패: ${res.error}`);
    }
  }

  async function handleDelete(ingredient_id: string) {
    const name = ingMap.get(ingredient_id)?.name ?? ingredient_id;
    setSaving(true);
    const res = await removeRecipe(target.menu_id, ingredient_id);
    setSaving(false);
    if (res.success) { toast.success(`${name} 삭제`); onRefresh(); }
    else toast.error(`삭제 실패: ${res.error}`);
  }

  async function handleEditSave(ingredient_id: string) {
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty <= 0) { toast.error('올바른 수량을 입력하세요'); return; }
    setSaving(true);
    const res = await saveRecipe(target.menu_id, ingredient_id, qty);
    setSaving(false);
    if (res.success) { toast.success('수량 수정'); setEditKey(null); onRefresh(); }
    else toast.error(`수정 실패: ${res.error}`);
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
          className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <div>
              <h2 className="text-[15px] font-extrabold text-[#161616]">{target.menu_name}</h2>
              <p className="text-[11px] text-[#aaa] mt-0.5">재료 {menuRecipes.length}종</p>
            </div>
            <button
              onClick={onClose}
              className="text-[#bbb] hover:text-[#555] text-xl leading-none cursor-pointer transition"
            >
              ✕
            </button>
          </div>

          {/* 재료 목록 */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {menuRecipes.length === 0 && (
              <p className="text-[12px] text-[#bbb] py-4 text-center">재료가 없습니다</p>
            )}
            <div className="divide-y divide-[#f5f5f5]">
              {menuRecipes.map((r) => {
                const ing = ingMap.get(r.ingredient_id);
                const isEditing = editKey === r.ingredient_id;
                return (
                  <div
                    key={r.ingredient_id}
                    className="flex items-center gap-2 py-2.5 cursor-pointer"
                    onClick={() => {
                      if (!isEditing) { setEditKey(r.ingredient_id); setEditQty(String(r.qty_per_unit)); }
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ing?.color ?? '#ccc' }}
                    />
                    <span className="text-[13px] font-semibold text-[#333] flex-1">
                      {ing?.name ?? r.ingredient_id}
                    </span>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          className="w-14 border border-[#ddd] rounded-lg text-xs text-center px-1.5 py-1 focus:outline-none focus:border-primary-700"
                          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                          autoFocus
                          min={0.1}
                        />
                        <span className="text-[10px] text-[#aaa]">{ing?.base_unit}</span>
                        <button
                          onClick={() => handleEditSave(r.ingredient_id)}
                          disabled={saving}
                          className="text-[11px] font-bold px-2 py-0.5 bg-primary-700 text-white rounded-lg cursor-pointer hover:bg-primary-800 transition border-none"
                        >저장</button>
                        <button
                          onClick={() => setEditKey(null)}
                          className="text-[11px] font-bold px-2 py-0.5 bg-[#eee] text-[#555] rounded-lg cursor-pointer hover:bg-[#ddd] transition border-none"
                        >취소</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] tabular-nums text-[#555] font-semibold">{r.qty_per_unit}</span>
                        <span className="text-[11px] text-[#aaa]">{ing?.base_unit}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r.ingredient_id); }}
                          disabled={saving}
                          className="ml-1 text-[#d0d0d0] hover:text-rose-500 cursor-pointer transition text-[13px]"
                        >✕</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 재료 추가 */}
          <div className="px-5 pb-5 pt-3 border-t border-[#f0f0f0] shrink-0">
            <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide mb-2">재료 추가</p>
            <div className="flex gap-2">
              <select
                value={addIngId}
                onChange={(e) => setAddIngId(e.target.value)}
                className="flex-1 border border-[#ddd] rounded-xl text-xs px-3 py-2 focus:outline-none focus:border-primary-700 bg-white cursor-pointer"
              >
                <option value="">재료 선택</option>
                {available.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.base_unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="수량"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="w-16 border border-[#ddd] rounded-xl text-xs text-center px-2 py-2 focus:outline-none focus:border-primary-700"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                min={0.1}
              />
              <span className="text-[11px] text-[#aaa] self-center shrink-0">
                {ingMap.get(addIngId)?.base_unit ?? ''}
              </span>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="text-[12px] font-bold px-3 py-2 bg-primary-700 text-white rounded-xl cursor-pointer hover:bg-primary-800 transition border-none disabled:opacity-50 shrink-0"
              >
                추가
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
