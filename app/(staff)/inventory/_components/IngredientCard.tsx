import { motion } from 'framer-motion';
import type { Ingredient } from '@/types/database';
import { totalQty, getStatus, type IngredientStatus } from '../_hooks/useInventory';

interface Props {
  ingredient: Ingredient;
  onManage: () => void;
  onAdjust: (delta: number) => void;
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

/** ±1 / ±10 네 버튼으로 총 수량을 바로 조작 — 박스/낱개 이원 관리 대신 단일 총량만 다룬다 */
function QuantityStepper({ value, unit, onAdjust, disabled, name }: {
  value: number; unit: string; onAdjust: (delta: number) => void; disabled: boolean; name: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onAdjust(-10)}
        disabled={disabled || value < 10}
        className="flex items-center justify-center h-6 px-1.5 rounded-md border border-hairline text-[10px] font-bold cursor-pointer bg-canvas-soft transition-all active:scale-95 leading-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        aria-label={`${name} 10 감소`}
      >
        −10
      </button>
      <button
        onClick={() => onAdjust(-1)}
        disabled={disabled || value < 1}
        className="flex items-center justify-center w-6 h-6 rounded-md border border-hairline text-[13px] font-semibold cursor-pointer bg-canvas-soft transition-all active:scale-95 leading-none disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        aria-label={`${name} 1 감소`}
      >
        −
      </button>
      <span className="relative flex-1 h-6 rounded-md overflow-hidden bg-canvas-soft flex items-center justify-center">
        <motion.span
          key={value}
          initial={{ scale: 1.25, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative z-10 text-[11px] font-bold text-ink-secondary tabular-nums"
        >
          {value}{unit}
        </motion.span>
      </span>
      <button
        onClick={() => onAdjust(1)}
        className="flex items-center justify-center w-6 h-6 rounded-md border border-hairline text-[13px] font-semibold cursor-pointer bg-canvas-soft transition-all active:scale-95 leading-none shrink-0"
        aria-label={`${name} 1 증가`}
      >
        +
      </button>
      <button
        onClick={() => onAdjust(10)}
        className="flex items-center justify-center h-6 px-1.5 rounded-md border border-hairline text-[10px] font-bold cursor-pointer bg-canvas-soft transition-all active:scale-95 leading-none shrink-0"
        aria-label={`${name} 10 증가`}
      >
        +10
      </button>
    </div>
  );
}

export default function IngredientCard({ ingredient, onManage, onAdjust, hasError, readOnly }: Props) {
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
      </div>

      {ingredient.vendor && (
        <div className="text-[9.5px] text-ink-faint mb-1 truncate" onClick={(e) => e.stopPropagation()}>
          {renderVendor(ingredient.vendor)}
        </div>
      )}

      {hasError && (
        <p className="text-[9.5px] font-bold text-rose-500 mb-1">저장 실패, 다시 시도</p>
      )}

      {/* POS식 +/- 재고 조작 — 총 수량 단일 스테퍼 (readOnly면 조회 전용이라 숨김) */}
      {!readOnly && (
        <div onClick={(e) => e.stopPropagation()}>
          <QuantityStepper
            value={ingredient.total_count} unit={ingredient.base_unit}
            onAdjust={onAdjust} disabled={ingredient.total_count <= 0} name={ingredient.name}
          />
        </div>
      )}
    </div>
  );
}
