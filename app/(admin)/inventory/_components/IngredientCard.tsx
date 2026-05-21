'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Ingredient, Recipe } from '@/types/database';
import { totalQty, getStatus, type IngredientStatus } from '../_hooks/useInventory';
import { updateIngredientSettings } from '@/app/actions';
import BoxStack from './BoxStack';

interface Props {
  ingredient: Ingredient;
  recipes: Recipe[];
  onRestock: () => void;
  onRefresh: () => void;
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
  const opened =
    ing.opened_remaining >= 1000
      ? `${(ing.opened_remaining / 1000).toFixed(1)}kg`
      : `${ing.opened_remaining}g`;
  return `${ing.sealed_count}${ing.container_unit} + ${opened}`;
}

const STATUS_STYLES: Record<IngredientStatus, { chip: string; border: string; bg: string }> = {
  out:  { chip: 'bg-rose-100 text-rose-600',       border: 'border-rose-200',   bg: 'bg-rose-50' },
  low:  { chip: 'bg-rose-100 text-rose-600',       border: 'border-rose-200',   bg: 'bg-white' },
  warn: { chip: 'bg-amber-100 text-amber-600',     border: 'border-amber-200',  bg: 'bg-white' },
  ok:   { chip: 'bg-emerald-100 text-emerald-600', border: 'border-emerald-200',bg: 'bg-white' },
};

const STATUS_LABELS: Record<IngredientStatus, string> = {
  out: '재고없음', low: '발주필요', warn: '주의', ok: '정상',
};

const CATEGORY_COLOR: Record<string, string> = {
  '빵': 'bg-orange-100 text-orange-600',
  '크림': 'bg-yellow-100 text-yellow-600',
  '과일': 'bg-pink-100 text-pink-600',
  '패키지': 'bg-blue-100 text-blue-600',
};

export default function IngredientCard({ ingredient, recipes, onRestock, onRefresh }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [containerSizeInput, setContainerSizeInput] = useState(String(ingredient.container_size));
  const [reorderInput, setReorderInput] = useState(String(ingredient.reorder_at_containers));
  const [saving, setSaving] = useState(false);

  const status = getStatus(ingredient);
  const styles = STATUS_STYLES[status];

  const usedInMenus = recipes
    .filter((r) => r.ingredient_id === ingredient.id)
    .map((r) => r.menu_items?.name ?? `메뉴 ${r.menu_id}`)
    .filter(Boolean);

  async function handleSaveSettings() {
    const cs = parseFloat(containerSizeInput);
    const ro = parseInt(reorderInput, 10);
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
      setShowSettings(false);
      onRefresh();
    } else {
      toast.error(`저장 실패: ${res.error}`);
    }
  }

  return (
    <div className={`${styles.bg} rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] border-[1.5px] ${styles.border} transition-all`}>
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="font-extrabold text-[#222] text-[13px]">{ingredient.name}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_COLOR[ingredient.category] ?? 'bg-gray-100 text-gray-500'}`}>
          {ingredient.category}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${styles.chip}`}>
          {STATUS_LABELS[status]}
        </span>
        <button
          onClick={() => {
            setShowSettings((v) => !v);
            setContainerSizeInput(String(ingredient.container_size));
            setReorderInput(String(ingredient.reorder_at_containers));
          }}
          className="ml-auto text-[10px] text-[#aaa] hover:text-[#555] cursor-pointer transition border border-[#e8e8e8] hover:border-[#bbb] px-2 py-0.5 rounded-full"
        >
          설정
        </button>
      </div>

      {/* 박스 시각화 */}
      <BoxStack ingredient={ingredient} />

      {/* 잔량 */}
      <div className="flex items-baseline gap-1.5 mt-0.5 mb-2">
        <span className="text-xl font-black tabular-nums text-[#161616]">
          {formatRemaining(ingredient)}
        </span>
        <span className="text-[11px] text-[#999]">{formatDetail(ingredient)}</span>
      </div>

      {/* 컨테이너 정보 */}
      <div className="text-[11px] text-[#aaa] mb-2">
        1{ingredient.container_unit} = {ingredient.container_size}{ingredient.base_unit}
      </div>

      {/* 사용 메뉴 */}
      {usedInMenus.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {usedInMenus.map((name) => (
            <span key={name} className="text-[10px] bg-[#f5f6f7] text-[#666] font-medium px-2 py-0.5 rounded-full border border-[#e8e8e8]">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* 설정 패널 */}
      {showSettings && (
        <div className="bg-[#f9f9f9] rounded-xl p-2.5 mb-2.5 border border-[#eee]">
          <div className="text-[10px] font-bold text-[#888] mb-2 uppercase tracking-wide">재료 설정</div>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-[#666] block mb-1">
                1{ingredient.container_unit}당 {ingredient.base_unit} 수
              </label>
              <input
                type="number"
                value={containerSizeInput}
                onChange={(e) => setContainerSizeInput(e.target.value)}
                className="w-full px-2 py-1 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                min={1}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-[#666] block mb-1">
                발주 기준 ({ingredient.container_unit})
              </label>
              <input
                type="number"
                value={reorderInput}
                onChange={(e) => setReorderInput(e.target.value)}
                className="w-full px-2 py-1 border border-[#ddd] rounded text-xs focus:outline-none focus:border-primary-700"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                min={0}
              />
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex-1 py-1 rounded-lg bg-primary-700 text-white text-[11px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="px-3 py-1 rounded-lg bg-[#eee] text-[#555] text-[11px] font-bold cursor-pointer hover:bg-[#e0e0e0] transition"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 입고 버튼 */}
      <button
        onClick={onRestock}
        className="w-full py-2 rounded-xl bg-primary-700 text-white text-[12px] font-bold cursor-pointer hover:bg-primary-800 transition"
      >
        + 입고 등록
      </button>
    </div>
  );
}
