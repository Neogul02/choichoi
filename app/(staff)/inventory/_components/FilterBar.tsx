export type SortKey = 'default' | 'qty_asc' | 'status';

interface Props {
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: '기본순', value: 'default' },
  { label: '잔량순', value: 'qty_asc' },
  { label: '상태순', value: 'status' },
];

export default function FilterBar({ sort, onSortChange, search, onSearchChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {SORT_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onSortChange(o.value)}
          className={`shrink-0 whitespace-nowrap text-[11px] font-bold px-2.5 py-1.5 rounded-lg border-none cursor-pointer transition ${
            sort === o.value
              ? 'bg-[#161616] text-white'
              : 'bg-canvas text-ink-muted border border-hairline hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
      {/* 재료가 수십 개면 정렬만으로는 못 찾는다 — 이름으로 바로 좁힌다 */}
      <div className="relative flex-1 min-w-[120px]">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="재료 검색"
          aria-label="재료 이름 검색"
          className="w-full px-2.5 py-1.5 pr-7 rounded-lg border border-hairline bg-canvas text-[12px] text-ink focus:outline-none focus:border-primary-700"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="검색어 지우기"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-none bg-transparent text-ink-faint hover:text-ink cursor-pointer text-[13px] leading-none"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
