const CATEGORIES = ['전체', '빵', '크림', '과일', '패키지'] as const;

export type SortKey = 'default' | 'qty_asc' | 'status';

interface Props {
  category: string;
  sort: SortKey;
  onCategoryChange: (c: string) => void;
  onSortChange: (s: SortKey) => void;
}

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '기본순', value: 'default' },
  { label: '잔량순', value: 'qty_asc' },
  { label: '상태순', value: 'status' },
];

export default function FilterBar({ category, sort, onCategoryChange, onSortChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1.5 overflow-x-auto">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => onCategoryChange(c)}
            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
              category === c
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-[#555] border-[#e0e0e0] hover:border-primary-700 hover:text-primary-700'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-1">
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => onSortChange(o.value)}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
              sort === o.value
                ? 'bg-[#161616] text-white border-[#161616]'
                : 'bg-white text-[#888] border-[#e0e0e0] hover:text-[#161616]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
