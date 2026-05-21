'use client';

import { useState } from 'react';
import type { Ingredient, Recipe } from '@/types/database';
import { totalQty, getStatus, type IngredientStatus } from '../_hooks/useInventory';
import BoxStack from './BoxStack';

interface Props {
  ingredient: Ingredient;
  recipes: Recipe[];
  onRestock: () => void;
}

function formatRemaining(ing: Ingredient): string {
  const qty = totalQty(ing);
  if (ing.unit_type === 'weight') {
    if (qty >= 1000) return `${(qty / 1000).toFixed(1)}kg`;
    return `${qty}g`;
  }
  return `${qty}${ing.base_unit}`;
}

function formatDetail(ing: Ingredient): string {
  if (ing.unit_type === 'count') {
    return `${ing.sealed_count}${ing.container_unit} + ${ing.opened_remaining}${ing.base_unit}`;
  }
  const opened = ing.opened_remaining >= 1000
    ? `${(ing.opened_remaining / 1000).toFixed(1)}kg`
    : `${ing.opened_remaining}g`;
  return `${ing.sealed_count}${ing.container_unit} + ${opened}`;
}

const STATUS_STYLES: Record<IngredientStatus, { chip: string; border: string }> = {
  out:  { chip: 'bg-rose-100 text-rose-600',   border: 'border-rose-200' },
  low:  { chip: 'bg-rose-100 text-rose-600',   border: 'border-rose-200' },
  warn: { chip: 'bg-amber-100 text-amber-600', border: 'border-amber-200' },
  ok:   { chip: 'bg-emerald-100 text-emerald-600', border: 'border-emerald-200' },
};

const STATUS_LABELS: Record<IngredientStatus, string> = {
  out: '재고 없음', low: '발주 필요', warn: '주의', ok: '정상',
};

const CATEGORY_COLOR: Record<string, string> = {
  '빵': 'bg-orange-100 text-orange-600',
  '크림': 'bg-yellow-100 text-yellow-600',
  '과일': 'bg-pink-100 text-pink-600',
  '패키지': 'bg-blue-100 text-blue-600',
};

export default function IngredientCard({ ingredient, recipes, onRestock }: Props) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(ingredient);
  const styles = STATUS_STYLES[status];

  const usedInMenus = recipes
    .filter((r) => r.ingredient_id === ingredient.id)
    .map((r) => r.menu_items?.name ?? `메뉴 ${r.menu_id}`)
    .filter(Boolean);

  return (
    <div
      className={`bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border ${styles.border} transition-all`}
    >
      {/* 상태 헤더 */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-[#161616] text-base">{ingredient.name}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[ingredient.category] ?? 'bg-gray-100 text-gray-500'}`}>
            {ingredient.category}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${styles.chip}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-[#999] shrink-0 mt-0.5"
          aria-label="펼치기"
        >
          {expanded ? '닫기' : '상세'}
        </button>
      </div>

      {/* 박스 시각화 */}
      <BoxStack ingredient={ingredient} />

      {/* 잔량 */}
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="text-2xl font-black tabular-nums" style={{ color: ingredient.color !== '#F5E6C8' ? '#161616' : '#161616' }}>
          {formatRemaining(ingredient)}
        </span>
        <span className="text-xs text-[#999]">{formatDetail(ingredient)}</span>
      </div>

      {/* 사용 메뉴 */}
      {usedInMenus.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {usedInMenus.map((name) => (
            <span key={name} className="text-[10px] bg-[#f5f6f7] text-[#666] font-medium px-2 py-0.5 rounded-full border border-[#e8e8e8]">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* 펼침 영역 */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#f0f0f0] flex gap-2">
          <button
            onClick={onRestock}
            className="flex-1 text-sm font-bold bg-primary-700 text-white rounded-xl py-2 hover:bg-primary-800 transition-colors"
          >
            + 입고
          </button>
        </div>
      )}
    </div>
  );
}
