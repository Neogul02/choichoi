import { motion } from 'framer-motion';
import type { Ingredient } from '@/types/database';
import { totalQty, getStatus, type IngredientStatus } from '../_hooks/useInventory';
import BoxStack from './BoxStack';

interface Props {
  ingredient: Ingredient;
  onManage: () => void;
  onIncreaseBox: () => void;
  onDecreaseBox: () => void;
  onIncreaseUnit: () => void;
  onDecreaseUnit: () => void;
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
  out:  { chip: 'bg-rose-100 text-rose-600',        border: 'border-[#e8e8e8]',   bg: 'bg-canvas' },
  low:  { chip: 'bg-rose-100 text-rose-600',        border: 'border-rose-200',    bg: 'bg-canvas' },
  warn: { chip: 'bg-amber-100 text-amber-600',      border: 'border-amber-200',   bg: 'bg-canvas' },
  ok:   { chip: 'bg-emerald-100 text-emerald-600',  border: 'border-[#e8e8e8]',   bg: 'bg-canvas' },
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

export default function IngredientCard({ ingredient, onManage, onIncreaseBox, onDecreaseBox, onIncreaseUnit, onDecreaseUnit }: Props) {
  const status = getStatus(ingredient);
  const styles = STATUS_STYLES[status];

  return (
    <div
      onClick={onManage}
      className={`${styles.bg} w-full text-left rounded-xl p-3.5 shadow-level-1 border-[1.5px] ${styles.border} transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] cursor-pointer active:scale-[0.99]`}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="font-extrabold text-ink text-[13px]">{ingredient.name}</span>
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
      <div className="flex items-baseline gap-1.5 mt-0.5 mb-1.5 overflow-hidden">
        <motion.span
          key={formatRemaining(ingredient)}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="text-xl font-black tabular-nums text-ink"
        >
          {formatRemaining(ingredient)}
        </motion.span>
        <span className="text-[11px] text-ink-faint">{formatDetail(ingredient)}</span>
      </div>

      {/* 컨테이너 정보 */}
      <div className="text-[11px] text-ink-faint mb-2.5">
        1{ingredient.container_unit} = {ingredient.container_size}{ingredient.base_unit}
      </div>

      {/* POS식 +/- 재고 조작: 박스 단위 + 낱개 단위 */}
      <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="w-9 text-[10px] font-bold text-ink-faint shrink-0">박스</span>
          <button
            onClick={onDecreaseBox}
            disabled={ingredient.sealed_count <= 0}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-hairline text-xl font-semibold cursor-pointer bg-canvas-soft transition-all duration-200 hover:bg-[#ececeb] active:scale-95 leading-none disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`${ingredient.name} 1${ingredient.container_unit} 감소`}
          >
            −
          </button>
          <span className="flex-1 text-center overflow-hidden">
            <motion.span
              key={ingredient.sealed_count}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="inline-block text-sm font-bold text-ink-secondary tabular-nums"
            >
              {ingredient.sealed_count}{ingredient.container_unit}
            </motion.span>
          </span>
          <button
            onClick={onIncreaseBox}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-hairline text-xl font-semibold cursor-pointer bg-canvas-soft transition-all duration-200 hover:bg-[#ececeb] active:scale-95 leading-none"
            aria-label={`${ingredient.name} 1${ingredient.container_unit} 증가`}
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-9 text-[10px] font-bold text-ink-faint shrink-0">낱개</span>
          <button
            onClick={onDecreaseUnit}
            disabled={ingredient.opened_remaining <= 0}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-hairline text-xl font-semibold cursor-pointer bg-canvas-soft transition-all duration-200 hover:bg-[#ececeb] active:scale-95 leading-none disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`${ingredient.name} 낱개 1${ingredient.base_unit} 감소`}
          >
            −
          </button>
          <span className="flex-1 text-center overflow-hidden">
            <motion.span
              key={ingredient.opened_remaining}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="inline-block text-sm font-bold text-ink-secondary tabular-nums"
            >
              {ingredient.opened_remaining}{ingredient.base_unit}
            </motion.span>
          </span>
          <button
            onClick={onIncreaseUnit}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-hairline text-xl font-semibold cursor-pointer bg-canvas-soft transition-all duration-200 hover:bg-[#ececeb] active:scale-95 leading-none"
            aria-label={`${ingredient.name} 낱개 1${ingredient.base_unit} 증가`}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
