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

export default function RecipePanel({ recipes, ingredients, onRefresh }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const menuMap = new Map<number, { name: string; items: Recipe[] }>();
  for (const r of recipes) {
    if (!menuMap.has(r.menu_id)) {
      menuMap.set(r.menu_id, { name: r.menu_items?.name ?? `메뉴 ${r.menu_id}`, items: [] });
    }
    menuMap.get(r.menu_id)!.items.push(r);
  }

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  async function handleQtyChange(menu_id: number, ingredient_id: string, qty: number) {
    if (qty <= 0) return;
    setSaving(true);
    const res = await saveRecipe(menu_id, ingredient_id, qty);
    setSaving(false);
    if (res.success) { onRefresh(); toast.success('레시피 저장'); }
    else toast.error(`저장 실패: ${res.error}`);
  }

  async function handleDelete(menu_id: number, ingredient_id: string) {
    setSaving(true);
    const res = await removeRecipe(menu_id, ingredient_id);
    setSaving(false);
    if (res.success) { onRefresh(); toast.success('항목 삭제'); }
    else toast.error(`삭제 실패: ${res.error}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-extrabold text-[#161616]">레시피 관리</h3>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
            editMode
              ? 'bg-[#161616] text-white border-[#161616]'
              : 'bg-white text-[#666] border-[#e0e0e0] hover:border-[#161616]'
          }`}
        >
          {editMode ? '완료' : '편집'}
        </button>
      </div>

      <div className="space-y-4">
        {Array.from(menuMap.entries()).map(([menu_id, { name, items }]) => (
          <div key={menu_id}>
            <div className="text-xs font-bold text-[#888] mb-1.5">{name}</div>
            <div className="space-y-1">
              {items.map((r) => {
                const ing = ingMap.get(r.ingredient_id);
                return (
                  <div key={r.ingredient_id} className="flex items-center gap-2 text-sm">
                    <span className="w-20 font-medium text-[#444] truncate">
                      {ing?.name ?? r.ingredient_id}
                    </span>
                    {editMode ? (
                      <input
                        type="number"
                        defaultValue={r.qty_per_unit}
                        min={1}
                        className="w-16 border border-[#e0e0e0] rounded-lg px-2 py-1 text-sm text-center outline-none focus:border-primary-700"
                        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v !== r.qty_per_unit) {
                            handleQtyChange(menu_id, r.ingredient_id, v);
                          }
                        }}
                        disabled={saving}
                      />
                    ) : (
                      <span className="text-[#666] tabular-nums">{r.qty_per_unit}</span>
                    )}
                    <span className="text-[#bbb] text-xs">{ing?.base_unit}</span>
                    {editMode && (
                      <button
                        onClick={() => handleDelete(menu_id, r.ingredient_id)}
                        className="ml-auto text-rose-400 hover:text-rose-600 text-xs"
                        disabled={saving}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
