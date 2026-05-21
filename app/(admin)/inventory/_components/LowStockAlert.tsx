import type { Ingredient } from '@/types/database';
import { getStatus } from '../_hooks/useInventory';

interface Props {
  ingredients: Ingredient[];
  onRestock: (ing: Ingredient) => void;
}

export default function LowStockAlert({ ingredients, onRestock }: Props) {
  const critical = ingredients.filter((i) => {
    const s = getStatus(i);
    return s === 'out' || s === 'low';
  });

  if (critical.length === 0) return null;

  return (
    <div className="bg-rose-50 border-[1.5px] border-rose-200 rounded-2xl px-3.5 py-2.5 flex flex-wrap gap-2 items-center">
      <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wide shrink-0">
        ⚠ 발주 필요
      </span>
      {critical.map((ing) => (
        <button
          key={ing.id}
          onClick={() => onRestock(ing)}
          className="text-[11px] bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition"
        >
          {ing.name} 입고
        </button>
      ))}
    </div>
  );
}
