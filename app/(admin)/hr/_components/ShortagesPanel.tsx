'use client';

import type { RosterShift } from '@/types/database';
import { dayOfWeek } from '@/lib/date';
import { DAY_NAMES } from './constants';

type ShortageItem = { date: string; shift: RosterShift; missing: number };

export default function ShortagesPanel({
  shortages,
  isLoading,
  onDateClick,
}: {
  shortages: ShortageItem[];
  isLoading: boolean;
  onDateClick: (d: string) => void;
}) {
  if (isLoading) return null;

  if (shortages.length === 0) {
    return <p className="mt-3 m-0 text-[12px] text-emerald-600 font-semibold">✓ 이달 모든 파트 인원이 채워졌습니다</p>;
  }

  const grouped = shortages.reduce<{ date: string; items: ShortageItem[] }[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.date === s.date) last.items.push(s);
    else acc.push({ date: s.date, items: [s] });
    return acc;
  }, []);

  return (
    <div className="mt-3 border border-rose-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border-b border-rose-200">
        <span className="text-[12px] font-bold text-rose-600">⚠ 인원 부족</span>
        <span className="text-[11px] text-rose-400">{grouped.length}일 · {shortages.length}건</span>
      </div>
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {grouped.map(({ date, items }, i) => {
            const day = dayOfWeek(date);
            return (
              <tr
                key={date}
                onClick={() => onDateClick(date)}
                className={`cursor-pointer hover:bg-rose-50 transition ${i !== grouped.length - 1 ? 'border-b border-rose-100' : ''}`}
              >
                <td className="px-3 py-2 font-semibold whitespace-nowrap w-[72px]">
                  {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                  <span className={`ml-1 text-[11px] ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>
                    ({DAY_NAMES[day]})
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {items.map(s => (
                      <span key={s.shift.id} className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">
                        {s.shift.name} {s.missing}명
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
