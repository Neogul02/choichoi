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
      <div className="flex gap-1 overflow-x-auto">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => onCategoryChange(c)}
            className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition ${
              category === c
                ? 'bg-primary-700 text-white'
                : 'bg-canvas text-ink-muted border border-hairline hover:bg-primary-50 hover:text-primary-700'
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
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition ${
              sort === o.value
                ? 'bg-[#161616] text-white'
                : 'bg-canvas text-ink-muted border border-hairline hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
