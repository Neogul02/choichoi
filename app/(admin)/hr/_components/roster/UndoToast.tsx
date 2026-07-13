'use client';

import { createPortal } from 'react-dom';

interface Props {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}

/** 파괴적 작업 직후 하단에 뜨는 되돌리기 토스트 — 표시/타이머 관리는 부모 담당 */
export default function UndoToast({ label, onUndo, onDismiss }: Props) {
  return createPortal(
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-[#161616] text-white rounded-xl px-4 py-2.5 shadow-level-2">
      <span className="text-[12px] font-semibold">{label}</span>
      <button
        onClick={onUndo}
        className="px-2.5 py-1 rounded-lg bg-white/15 border-none text-white text-[12px] font-bold cursor-pointer hover:bg-white/25 transition"
      >
        되돌리기
      </button>
      <button
        onClick={onDismiss}
        aria-label="되돌리기 알림 닫기"
        className="bg-transparent border-none text-white/60 text-[14px] cursor-pointer leading-none hover:text-white transition"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
