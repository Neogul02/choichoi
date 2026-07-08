import type { Ingredient } from '@/types/database';
import { getStatus } from '../_hooks/useInventory';

interface Props {
  ingredients: Ingredient[];
}

export default function StatusStrip({ ingredients }: Props) {
  const counts = ingredients.reduce(
    (acc, ing) => {
      const s = getStatus(ing);
      if (s === 'out' || s === 'low') acc.low++;
      else if (s === 'warn') acc.warn++;
      else acc.ok++;
      return acc;
    },
    { low: 0, warn: 0, ok: 0 }
  );

  return (
    <div className="flex gap-2">
      <div className="flex-1 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-center">
        <div className="text-lg font-black text-rose-600 tabular-nums">{counts.low}</div>
        <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wide">발주</div>
      </div>
      <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
        <div className="text-lg font-black text-amber-600 tabular-nums">{counts.warn}</div>
        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">주의</div>
      </div>
      <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-center">
        <div className="text-lg font-black text-emerald-600 tabular-nums">{counts.ok}</div>
        <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">정상</div>
      </div>
    </div>
  );
}
