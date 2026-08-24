'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getPopupPeriod, POPUP_STATUS_BADGE_CLASS } from '@/lib/popupPeriod';
import { kstToday } from '@/lib/date';
import type { PopupEvent } from '@/types/database';

interface Props {
  popups: PopupEvent[];
  value: number | 'all';
  onChange: (value: number | 'all') => void;
}

// 진행중 팝업 우선 정렬 + 상태 배지로 네이티브 select보다 한눈에 들어오게 만든 커스텀 드롭다운
// (통계 탭 PopupPicker와 동일한 패턴)
export default function PopupFilterPicker({ popups, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const todayStr = kstToday();

  const selected = value === 'all' ? null : popups.find((p) => p.id === value) ?? null;

  const sorted = useMemo(() => {
    const withStatus = popups.map((p) => ({ popup: p, period: getPopupPeriod(p, todayStr) }));
    const rank: Record<string, number> = { 진행중: 0, 예정: 1, 종료: 2 };
    return withStatus.sort((a, b) => rank[a.period.status] - rank[b.period.status] || b.popup.start_date.localeCompare(a.popup.start_date));
  }, [popups, todayStr]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-hairline rounded-xl text-[12px] font-bold bg-canvas shadow-level-1 focus:outline-none focus:border-primary-700 cursor-pointer"
      >
        {selected ? (
          <>
            <span className="max-w-[140px] truncate">{selected.name}</span>
            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${POPUP_STATUS_BADGE_CLASS[getPopupPeriod(selected, todayStr).status]}`}>
              {getPopupPeriod(selected, todayStr).status}
            </span>
          </>
        ) : (
          <span>전체 팝업</span>
        )}
        <span className="text-ink-faint">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 w-64 bg-canvas border border-hairline rounded-lg shadow-level-2 overflow-hidden">
          <ul className="max-h-64 overflow-y-auto m-0 p-1 list-none">
            <li>
              <button
                type="button"
                onClick={() => { onChange('all'); setOpen(false); }}
                className={`w-full px-2.5 py-2 rounded-md text-left text-[13px] font-semibold cursor-pointer border-none ${
                  value === 'all' ? 'bg-primary-700 text-white' : 'bg-transparent text-ink-secondary hover:bg-canvas-soft'
                }`}
              >
                전체 팝업
              </button>
            </li>
            {sorted.map(({ popup, period }) => (
              <li key={popup.id}>
                <button
                  type="button"
                  onClick={() => { onChange(popup.id); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left text-[13px] cursor-pointer border-none ${
                    popup.id === value ? 'bg-primary-700 text-white' : 'bg-transparent text-ink-secondary hover:bg-canvas-soft'
                  }`}
                >
                  <span className="truncate font-semibold">{popup.name}</span>
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${popup.id === value ? 'bg-white/15 text-white border-white/30' : POPUP_STATUS_BADGE_CLASS[period.status]}`}>
                    {period.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
