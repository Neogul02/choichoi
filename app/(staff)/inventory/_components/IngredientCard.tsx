import { motion } from 'framer-motion';
import type { Ingredient } from '@/types/database';
import { totalQty, getStatus, type IngredientStatus } from '../_hooks/useInventory';

interface Props {
  ingredient: Ingredient;
  onManage: () => void;
  onIncreaseBox: () => void;
  onDecreaseBox: () => void;
  onIncreaseUnit: () => void;
  onDecreaseUnit: () => void;
  /** 디바운스 동기화 실패로 로컬 변경분이 되돌려졌을 때 카드에 표시 */
  hasError?: boolean;
  /** user 역할 — 조회만 가능, 관리 모달·재고 조작 버튼 숨김 */
  readOnly?: boolean;
}

function formatRemaining(ing: Ingredient): string {
  const qty = totalQty(ing);
  if (ing.unit_type === 'weight') {
    return qty >= 1000 ? `${(qty / 1000).toFixed(1)}kg` : `${qty}g`;
  }
  return `${qty}${ing.base_unit}`;
}

const PHONE_PATTERN = /(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})/;

/** 거래처 문자열에 전화번호가 섞여 있으면 그 부분만 tel: 링크로 렌더 (모바일 탭 연결) */
function renderVendor(vendor: string) {
  const match = vendor.match(PHONE_PATTERN);
  if (!match) return <span>{vendor}</span>;
  const phone = match[0];
  const idx = match.index ?? 0;
  const before = vendor.slice(0, idx);
  const after = vendor.slice(idx + phone.length);
  return (
    <>
      {before}
      <a href={`tel:${phone.replace(/[^0-9]/g, '')}`} className="font-bold text-primary-700 underline underline-offset-2">
        {phone}
      </a>
      {after}
    </>
  );
}

const STATUS_STYLES: Record<IngredientStatus, { chip: string; border: string; bg: string }> = {
  out:  { chip: 'bg-rose-100 text-rose-600',        border: 'border-[#e8e8e8]',   bg: 'bg-canvas' },
  low:  { chip: 'bg-rose-100 text-rose-600',        border: 'border-rose-200',    bg: 'bg-canvas' },
  warn: { chip: 'bg-amber-100 text-amber-600',      border: 'border-amber-200',   bg: 'bg-canvas' },
  ok:   { chip: 'bg-emerald-100 text-emerald-600',  border: 'border-[#e8e8e8]',   bg: 'bg-canvas' },
};

const STATUS_LABELS: Record<IngredientStatus, string> = {
  out: '없음', low: '발주', warn: '주의', ok: '정상',
};

function Stepper({
  label, value, unit, onIncrease, onDecrease, disabled, name, color, cap,
}: {
  label: string; value: number; unit: string; onIncrease: () => void; onDecrease: () => void; disabled: boolean; name: string; color: string; cap: number;
}) {
  const ratio = cap > 0 ? Math.min(1, Math.max(0, value / cap)) : 0;
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onDecrease}
        disabled={disabled}
        className="flex items-center justify-center w-6 h-6 rounded-md border border-hairline text-[13px] font-semibold cursor-pointer bg-canvas-soft transition-all active:scale-95 leading-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        aria-label={`${name} ${label} 감소`}
      >
        −
      </button>
      <span className="relative flex-1 h-6 rounded-md overflow-hidden bg-canvas-soft">
        <span
          className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
          style={{ width: `${ratio * 100}%`, backgroundColor: color, opacity: 0.32 }}
        />
        <motion.span
          key={value}
          initial={{ scale: 1.25, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative z-10 flex items-center justify-center h-full text-[11px] font-bold text-ink-secondary tabular-nums"
        >
          {value}{unit}
        </motion.span>
      </span>
      <button
        onClick={onIncrease}
        className="flex items-center justify-center w-6 h-6 rounded-md border border-hairline text-[13px] font-semibold cursor-pointer bg-canvas-soft transition-all active:scale-95 leading-none shrink-0"
        aria-label={`${name} ${label} 증가`}
      >
        +
      </button>
    </div>
  );
}

export default function IngredientCard({ ingredient, onManage, onIncreaseBox, onDecreaseBox, onIncreaseUnit, onDecreaseUnit, hasError, readOnly }: Props) {
  const status = getStatus(ingredient);
  const styles = STATUS_STYLES[status];

  return (
    <div
      onClick={readOnly ? undefined : onManage}
      className={`${styles.bg} w-full text-left rounded-lg p-2 shadow-level-1 border-[1.5px] ${hasError ? 'border-rose-400' : styles.border} transition-all ${readOnly ? '' : 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] cursor-pointer active:scale-[0.99]'}`}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-1 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: ingredient.color }} />
        <span className="font-extrabold text-ink text-[11.5px] truncate flex-1">{ingredient.name}</span>
        <span className={`text-[8.5px] font-bold px-1 py-0.5 rounded-full shrink-0 ${styles.chip}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* 잔량 */}
      <div className="flex items-baseline gap-1 mb-1 overflow-hidden">
        <motion.span
          key={formatRemaining(ingredient)}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="text-[15px] font-black tabular-nums text-ink"
        >
          {formatRemaining(ingredient)}
        </motion.span>
        <span className="text-[9.5px] text-ink-faint truncate">
          1{ingredient.container_unit}={ingredient.container_size}{ingredient.base_unit}
        </span>
      </div>

      {ingredient.vendor && (
        <div className="text-[9.5px] text-ink-faint mb-1 truncate" onClick={(e) => e.stopPropagation()}>
          {renderVendor(ingredient.vendor)}
        </div>
      )}

      {hasError && (
        <p className="text-[9.5px] font-bold text-rose-500 mb-1">저장 실패, 다시 시도</p>
      )}

      {/* POS식 +/- 재고 조작: 박스 단위 + 낱개 단위 (readOnly면 조회 전용이라 숨김) */}
      {!readOnly && (
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <Stepper
            label="박스" value={ingredient.sealed_count} unit={ingredient.container_unit}
            onIncrease={onIncreaseBox} onDecrease={onDecreaseBox}
            disabled={ingredient.sealed_count <= 0} name={ingredient.name}
            color={ingredient.color} cap={12}
          />
          <Stepper
            label="낱개" value={ingredient.opened_remaining} unit={ingredient.base_unit}
            onIncrease={onIncreaseUnit} onDecrease={onDecreaseUnit}
            disabled={ingredient.opened_remaining <= 0} name={ingredient.name}
            color={ingredient.color} cap={ingredient.container_size}
          />
        </div>
      )}
    </div>
  );
}
