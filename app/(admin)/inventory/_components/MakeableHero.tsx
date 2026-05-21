import type { MakeableResult } from '@/types/api';

interface Props {
  makeable: MakeableResult[];
}

export default function MakeableHero({ makeable }: Props) {
  const sandos = makeable.filter((m) => !m.menu_name.includes('보냉백'));
  if (sandos.length === 0) return null;

  const total = sandos.reduce((s, m) => s + m.count, 0);
  const tightest = sandos.reduce((a, b) => (a.count <= b.count ? a : b), sandos[0]);

  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="text-[12px] font-extrabold text-[#161616]">
          지금{' '}
          <span className="text-2xl font-black text-primary-700 tabular-nums">{total}</span>
          개 더 만들 수 있어요
        </h3>
        {tightest.count < 10 && (
          <span className="text-[10px] text-rose-500 font-bold shrink-0">
            임박: {tightest.bottleneck} {tightest.count}개
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {sandos.map((m) => {
          const isCritical = m.count === 0;
          return (
            <div
              key={m.menu_id}
              className={`rounded-xl px-3 py-2.5 text-center border-[1.5px] ${
                isCritical ? 'bg-rose-50 border-rose-200' : 'bg-primary-50 border-primary-100'
              }`}
            >
              <div className={`text-2xl font-black tabular-nums ${isCritical ? 'text-rose-500' : 'text-primary-700'}`}>
                {m.count}
              </div>
              <div className="text-[11px] font-semibold text-[#888] mt-0.5 truncate">{m.menu_name}</div>
              {m.bottleneck && m.count < 5 && (
                <div className="text-[10px] text-rose-400 mt-0.5 truncate">↑ {m.bottleneck}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
