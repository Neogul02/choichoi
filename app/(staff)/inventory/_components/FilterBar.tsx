export type SortKey = 'default' | 'qty_asc' | 'status';

interface Props {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '기본순', value: 'default' },
  { label: '잔량순', value: 'qty_asc' },
  { label: '상태순', value: 'status' },
];

export default function FilterBar({ sort, onSortChange }: Props) {
  return (
    <div className="flex items-center gap-1">
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
  );
}
