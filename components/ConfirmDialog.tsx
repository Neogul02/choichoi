'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** 삭제·초기화 등 되돌리기 어려운 동작이면 true — 확인 버튼이 rose로 표시되고, 열릴 때 취소 버튼에 포커스된다 */
  danger?: boolean;
  /** 비동기 처리 중이면 true — 버튼 비활성화, 배경 클릭으로 닫히지 않음 */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** 파괴적 동작 확인 모달 — NavBar 로그아웃 확인 UI와 동일한 스타일을 공유 컴포넌트로 추출 */
export default function ConfirmDialog({
  open, title, description, confirmLabel, cancelLabel = '취소', danger = false, busy = false, onConfirm, onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useBodyScrollLock(open);

  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useModalKeyboard({
    active: open,
    onClose: () => { if (!busy) onClose(); },
    containerRef: panelRef,
    initialFocusRef: danger ? cancelRef : confirmRef,
    onConfirm: () => { if (!busy) onConfirm(); },
  });

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
        >
          <motion.div
            key="confirm-panel"
            ref={panelRef}
            initial={{ y: 16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-canvas w-full max-w-[320px] rounded-xl shadow-level-2 border border-hairline p-5"
          >
            <h3 id="confirm-dialog-title" className="m-0 mb-1.5 text-[16px] font-bold text-ink">{title}</h3>
            {description && <p className="m-0 mb-5 text-[13px] text-ink-muted">{description}</p>}
            <div className={`flex gap-2 ${!description ? 'mt-5' : ''}`}>
              <button
                ref={cancelRef}
                onClick={onClose}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas-soft text-ink-secondary text-[13px] font-semibold cursor-pointer hover:bg-[#ececec] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                onClick={onConfirm}
                disabled={busy}
                className={`flex-1 py-2.5 rounded-lg border-none text-white text-[13px] font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  danger ? 'bg-rose-500 hover:bg-rose-600' : 'bg-primary-700 hover:bg-primary-800'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
