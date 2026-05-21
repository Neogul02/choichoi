'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Ingredient, Recipe } from '@/types/database';
import { saveRecipe, removeRecipe } from '@/app/actions';

interface Props {
  recipes: Recipe[];
  ingredients: Ingredient[];
  onRefresh: () => void;
}

interface AddRowState {
  ingredient_id: string;
  qty: string;
}

const EMPTY_ADD: AddRowState = { ingredient_id: '', qty: '' };

export default function RecipePanel({ recipes, ingredients, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [addRow, setAddRow] = useState<AddRowState>(EMPTY_ADD);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');

  const menuMap = new Map<number, { name: string; items: Recipe[] }>();
  for (const r of recipes) {
    if (!menuMap.has(r.menu_id)) {
      menuMap.set(r.menu_id, { name: r.menu_items?.name ?? `메뉴 ${r.menu_id}`, items: [] });
    }
    menuMap.get(r.menu_id)!.items.push(r);
  }

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  async function handleAdd(menu_id: number) {
    const qty = parseFloat(addRow.qty);
    if (!addRow.ingredient_id || isNaN(qty) || qty <= 0) {
      toast.error('재료와 수량을 올바르게 입력하세요');
      return;
    }
    setSaving(true);
    const res = await saveRecipe(menu_id, addRow.ingredient_id, qty);
    setSaving(false);
    if (res.success) {
      toast.success('레시피 추가');
      setAddingTo(null);
      setAddRow(EMPTY_ADD);
      onRefresh();
    } else {
      toast.error(`추가 실패: ${res.error}`);
    }
  }

  async function handleDelete(menu_id: number, ingredient_id: string, name: string) {
    setSaving(true);
    const res = await removeRecipe(menu_id, ingredient_id);
    setSaving(false);
    if (res.success) { toast.success(`${name} 삭제`); onRefresh(); }
    else toast.error(`삭제 실패: ${res.error}`);
  }

  async function handleEditSave(menu_id: number, ingredient_id: string) {
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty <= 0) { toast.error('올바른 수량을 입력하세요'); return; }
    setSaving(true);
    const res = await saveRecipe(menu_id, ingredient_id, qty);
    setSaving(false);
    if (res.success) { toast.success('수량 수정'); setEditKey(null); onRefresh(); }
    else toast.error(`수정 실패: ${res.error}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-extrabold text-[#161616]">레시피 관리</h3>
        <span className="text-[10px] text-[#aaa]">행을 클릭하면 수량 수정</span>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from(menuMap.entries()).map(([menu_id, { name, items }]) => {
          const usedIds = new Set(items.map((r) => r.ingredient_id));
          const availableIngs = ingredients.filter((i) => !usedIds.has(i.id));
          const isAdding = addingTo === menu_id;

          return (
            <div key={menu_id} className="bg-[#f9f9f9] rounded-xl border border-[#eee] overflow-hidden">
              {/* 메뉴 헤더 */}
              <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-[#eee]">
                <span className="text-[12px] font-extrabold text-[#222]">{name}</span>
                <button
                  onClick={() => {
                    setAddingTo(isAdding ? null : menu_id);
                    setAddRow(EMPTY_ADD);
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition ${
                    isAdding
                      ? 'bg-[#eee] text-[#555]'
                      : 'bg-primary-700 text-white hover:bg-primary-800'
                  }`}
                >
                  {isAdding ? '취소' : '+ 재료 추가'}
                </button>
              </div>

              {/* 재료 목록 */}
              <div className="divide-y divide-[#f0f0f0]">
                {items.map((r) => {
                  const ing = ingMap.get(r.ingredient_id);
                  const key = `${menu_id}-${r.ingredient_id}`;
                  const isEditing = editKey === key;

                  return (
                    <div
                      key={r.ingredient_id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white transition cursor-pointer"
                      onClick={() => {
                        if (!isEditing) { setEditKey(key); setEditQty(String(r.qty_per_unit)); }
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ing?.color ?? '#ccc' }}
                      />
                      <span className="text-[12px] font-semibold text-[#333] w-20 truncate">
                        {ing?.name ?? r.ingredient_id}
                      </span>

                      {isEditing ? (
                        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="w-14 border border-[#ddd] rounded text-xs text-center px-1 py-0.5 focus:outline-none focus:border-primary-700"
                            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                            autoFocus
                            min={0.1}
                          />
                          <span className="text-[10px] text-[#aaa]">{ing?.base_unit}</span>
                          <button
                            onClick={() => handleEditSave(menu_id, r.ingredient_id)}
                            disabled={saving}
                            className="text-[10px] font-bold px-2 py-0.5 bg-primary-700 text-white rounded cursor-pointer hover:bg-primary-800 transition"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditKey(null)}
                            className="text-[10px] font-bold px-2 py-0.5 bg-[#eee] text-[#555] rounded cursor-pointer hover:bg-[#ddd] transition"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[12px] tabular-nums text-[#444] font-semibold">
                            {r.qty_per_unit}
                          </span>
                          <span className="text-[10px] text-[#aaa]">{ing?.base_unit}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(menu_id, r.ingredient_id, ing?.name ?? r.ingredient_id);
                            }}
                            disabled={saving}
                            className="ml-2 text-[10px] text-[#ccc] hover:text-rose-500 cursor-pointer transition"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 재료 추가 폼 */}
                {isAdding && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 border-t border-primary-100">
                    <select
                      value={addRow.ingredient_id}
                      onChange={(e) => setAddRow((v) => ({ ...v, ingredient_id: e.target.value }))}
                      className="flex-1 border border-[#ddd] rounded text-xs px-2 py-1 focus:outline-none focus:border-primary-700 bg-white cursor-pointer"
                    >
                      <option value="">재료 선택</option>
                      {availableIngs.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.base_unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="수량"
                      value={addRow.qty}
                      onChange={(e) => setAddRow((v) => ({ ...v, qty: e.target.value }))}
                      className="w-16 border border-[#ddd] rounded text-xs text-center px-1 py-1 focus:outline-none focus:border-primary-700"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                      min={0.1}
                    />
                    <span className="text-[10px] text-[#aaa] shrink-0">
                      {ingMap.get(addRow.ingredient_id)?.base_unit ?? '단위'}
                    </span>
                    <button
                      onClick={() => handleAdd(menu_id)}
                      disabled={saving}
                      className="text-[11px] font-bold px-2.5 py-1 bg-primary-700 text-white rounded-lg cursor-pointer hover:bg-primary-800 transition disabled:opacity-50 border-none shrink-0"
                    >
                      추가
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
