import type { Ingredient, Recipe } from '@/types/database';
import { totalQty, getStatus, type IngredientStatus } from '../_hooks/useInventory';
import BoxStack from './BoxStack';

interface Props {
  ingredient: Ingredient;
  recipes: Recipe[];
  onClick: () => void;
}

function formatRemaining(ing: Ingredient): string {
  const qty = totalQty(ing);
  if (ing.unit_type === 'weight') {
    return qty >= 1000 ? `${(qty / 1000).toFixed(1)}kg` : `${qty}g`;
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
  out:  { chip: 'bg-rose-100 text-rose-600',        border: 'border-rose-300',    bg: 'bg-rose-50' },
  low:  { chip: 'bg-rose-100 text-rose-600',        border: 'border-rose-200',    bg: 'bg-white' },
  warn: { chip: 'bg-amber-100 text-amber-600',      border: 'border-amber-200',   bg: 'bg-white' },
  ok:   { chip: 'bg-emerald-100 text-emerald-600',  border: 'border-[#e8e8e8]',   bg: 'bg-white' },
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

export default function IngredientCard({ ingredient, recipes, onClick }: Props) {
  const status = getStatus(ingredient);
  const styles = STATUS_STYLES[status];

  const usedInMenus = recipes
    .filter((r) => r.ingredient_id === ingredient.id)
    .map((r) => r.menu_items?.name ?? `메뉴 ${r.menu_id}`)
    .filter(Boolean);

  return (
    <button
      onClick={onClick}
      className={`${styles.bg} w-full text-left rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] border-[1.5px] ${styles.border} transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] cursor-pointer active:scale-[0.99]`}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="font-extrabold text-[#222] text-[13px]">{ingredient.name}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CATEGORY_COLOR[ingredient.category] ?? 'bg-gray-100 text-gray-500'}`}>
          {ingredient.category}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${styles.chip}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* 박스 시각화 */}
      <BoxStack ingredient={ingredient} />

      {/* 잔량 */}
      <div className="flex items-baseline gap-1.5 mt-0.5 mb-1.5">
        <span className="text-xl font-black tabular-nums text-[#161616]">
          {formatRemaining(ingredient)}
        </span>
        <span className="text-[11px] text-[#999]">{formatDetail(ingredient)}</span>
      </div>

      {/* 컨테이너 정보 */}
      <div className="text-[11px] text-[#bbb] mb-2">
        1{ingredient.container_unit} = {ingredient.container_size}{ingredient.base_unit}
      </div>

      {/* 사용 메뉴 */}
      {usedInMenus.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {usedInMenus.map((name) => (
            <span key={name} className="text-[10px] bg-[#f5f6f7] text-[#666] font-medium px-2 py-0.5 rounded-full border border-[#e8e8e8]">
              {name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
