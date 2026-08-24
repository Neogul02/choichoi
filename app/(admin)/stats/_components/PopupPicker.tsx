'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getPopupPeriod, POPUP_STATUS_BADGE_CLASS } from '@/lib/popupPeriod';
import { kstToday } from '@/lib/date';
import type { PopupEvent } from '@/types/database';

interface Props {
  popupEvents: PopupEvent[];
  selectedPopupId: number | null;
  onSelectPopup: (id: number | null) => void;
}

// 네이티브 select로는 상태 배지·기간을 함께 못 보여줘 커스텀 드롭다운으로 교체.
// 진행중 팝업을 최상단에 올리고 상태 배지를 붙여 한눈에 골라낼 수 있게 한다.
export default function PopupPicker({ popupEvents, selectedPopupId, onSelectPopup }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const todayStr = kstToday();

  const selectedPopup = popupEvents.find((p) => p.id === selectedPopupId) ?? null;

  const sorted = useMemo(() => {
    const withStatus = popupEvents.map((p) => ({ popup: p, period: getPopupPeriod(p, todayStr) }));
    const rank: Record<string, number> = { 진행중: 0, 예정: 1, 종료: 2 };
    return withStatus.sort((a, b) => rank[a.period.status] - rank[b.period.status] || b.popup.start_date.localeCompare(a.popup.start_date));
  }, [popupEvents, todayStr]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 border border-[#d8e8e0] rounded-lg px-3 py-2.5 text-sm font-semibold bg-canvas text-ink-secondary outline-none focus:border-primary-700 cursor-pointer"
      >
        {selectedPopup ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{selectedPopup.name}</span>
            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${POPUP_STATUS_BADGE_CLASS[getPopupPeriod(selectedPopup, todayStr).status]}`}>
              {getPopupPeriod(selectedPopup, todayStr).status}
            </span>
          </span>
        ) : (
          <span className="text-ink-faint">팝업을 선택하세요</span>
        )}
        <span className="text-ink-faint shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-canvas border border-[#d8e8e0] rounded-lg shadow-level-2 overflow-hidden">
          <ul className="max-h-64 overflow-y-auto m-0 p-1 list-none">
            {sorted.map(({ popup, period }) => (
              <li key={popup.id}>
                <button
                  type="button"
                  onClick={() => { onSelectPopup(popup.id); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left text-[13px] cursor-pointer border-none ${
                    popup.id === selectedPopupId ? 'bg-primary-700 text-white' : 'bg-transparent text-ink-secondary hover:bg-canvas-soft'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-semibold">{popup.name}</span>
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${popup.id === selectedPopupId ? 'bg-white/15 text-white border-white/30' : POPUP_STATUS_BADGE_CLASS[period.status]}`}>
                      {period.status}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[11px] ${popup.id === selectedPopupId ? 'text-white/80' : 'text-ink-faint'}`}>
                    {popup.start_date} ~ {popup.end_date}
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
