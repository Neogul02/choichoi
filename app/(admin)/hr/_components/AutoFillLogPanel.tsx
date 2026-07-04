'use client';

import type { AutoFillLogEntry } from '@/app/actions/roster';
import { dayOfWeek } from '@/lib/date';
import { DAY_NAMES } from './constants';

export default function AutoFillLogPanel({
  fillLog,
  onClose,
  onDateClick,
}: {
  fillLog: AutoFillLogEntry[];
  onClose: () => void;
  onDateClick: (d: string) => void;
}) {
  if (fillLog.length === 0) return null;

  const grouped = fillLog.reduce<{ date: string; entries: AutoFillLogEntry[] }[]>((acc, e) => {
    const last = acc[acc.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else acc.push({ date: e.date, entries: [e] });
    return acc;
  }, []);

  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-blue-200 bg-blue-100/60">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-blue-700">배정 결과 로그</span>
          <span className="text-[11px] text-blue-500">{fillLog.reduce((s, e) => s + e.names.length, 0)}명 · {grouped.length}일</span>
        </div>
        <button onClick={onClose} className="text-[11px] text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer transition">닫기</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <tbody>
            {grouped.map(({ date, entries }) => {
              const day = dayOfWeek(date);
              return (
                <tr key={date} className="border-b border-blue-100 last:border-b-0 hover:bg-blue-100/40 transition cursor-pointer" onClick={() => onDateClick(date)}>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap w-[80px] text-blue-800">
                    {Number(date.slice(5, 7))}/{Number(date.slice(8))}
                    <span className={`ml-1 text-[11px] ${day === 0 ? 'text-red-400' : day === 6 ? 'text-blue-400' : 'text-ink-muted'}`}>
                      ({DAY_NAMES[day]})
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {entries.map((e, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          <span className="text-[10px] opacity-70">{e.shiftName}</span>
                          {e.names.join(', ')}
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
    </div>
  );
}
