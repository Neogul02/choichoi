import type { Ingredient } from '@/types/database';
import { totalQty } from '../_hooks/useInventory';

interface Props {
  ingredient: Ingredient;
  maxDisplay?: number;
}

function BoxIcon({
  fill,
  color,
  isOpened,
  isCount,
}: {
  fill: number;
  color: string;
  isOpened?: boolean;
  isCount: boolean;
}) {
  const w = isCount ? 20 : 28;
  const h = isCount ? 32 : 24;
  const filled = Math.round(h * Math.min(1, Math.max(0, fill)));

  return (
    <div
      className="relative rounded-sm border border-black/10 overflow-hidden flex-shrink-0"
      style={{ width: w, height: h, backgroundColor: '#e5e7eb' }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 transition-all"
        style={{ height: filled, backgroundColor: color, opacity: isOpened ? 0.6 : 0.9 }}
      />
      {isOpened && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[3px] h-[3px] rounded-full bg-black/20" />
        </div>
      )}
    </div>
  );
}

export default function BoxStack({ ingredient, maxDisplay = 12 }: Props) {
  const { sealed_count, opened_remaining, container_size, unit_type, color } = ingredient;
  const qty = totalQty(ingredient);
  const openedRatio = container_size > 0 ? opened_remaining / container_size : 0;
  const hasOpened = opened_remaining > 0;
  const displaySealed = Math.min(sealed_count, maxDisplay);
  const overflow = sealed_count - displaySealed;

  if (qty === 0) {
    return (
      <div className="flex items-center gap-1.5 py-2 text-xs text-[#bbb] font-medium">
        재고 없음
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1 flex-wrap py-2">
      {Array.from({ length: displaySealed }).map((_, i) => (
        <BoxIcon key={i} fill={1} color={color} isCount={unit_type === 'count'} />
      ))}
      {hasOpened && (
        <BoxIcon fill={openedRatio} color={color} isOpened isCount={unit_type === 'count'} />
      )}
      {overflow > 0 && (
        <span className="text-xs text-[#999] font-semibold self-end pb-1">+{overflow}</span>
      )}
    </div>
  );
}
