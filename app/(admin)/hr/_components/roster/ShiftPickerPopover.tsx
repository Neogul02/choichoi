'use client';

import { createPortal } from 'react-dom';
import type { RosterShift } from '@/types/database';

interface Props {
  dateStr: string;
  x: number;
  y: number;
  shifts: RosterShift[];
  onPick: (shiftId: number) => void;
  onClose: () => void;
}

/** 드롭한 날짜에 활성 파트가 여러 개일 때 커서 위치에 뜨는 파트 선택 팝오버 */
export default function ShiftPickerPopover({ dateStr, x, y, shifts, onPick, onClose }: Props) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[49]" onClick={onClose} />
      <div
        className="fixed z-50 bg-canvas border border-hairline rounded-xl shadow-level-2 p-2 min-w-[160px]"
        style={{ left: x + 8, top: y + 8 }}
      >
        <p className="m-0 mb-1.5 text-[10px] font-bold text-ink-muted px-1">파트 선택</p>
        {shifts
          .filter(s => (!s.active_from || dateStr >= s.active_from) && (!s.active_to || dateStr <= s.active_to))
          .map(s => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[12px] hover:bg-canvas-soft cursor-pointer bg-transparent border-none transition"
            >
              {s.name} <span className="text-ink-faint text-[10px]">{s.start_time}~{s.end_time}</span>
            </button>
          ))
        }
        <button onClick={onClose} className="w-full text-center text-[10px] text-ink-faint mt-1 bg-transparent border-none cursor-pointer hover:text-ink transition">취소</button>
      </div>
    </>,
    document.body,
  );
}
