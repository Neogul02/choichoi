'use client';

import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { createStorageObject } from '@/app/actions/storage';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useModalKeyboard } from '@/lib/useModalKeyboard';
import { STORAGE_ICONS } from './storageIcons';
import type { StorageObjectIcon } from '@/types/database';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddStorageObjectModal({ open, onClose, onSuccess }: Props) {
  useBodyScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalKeyboard({ active: open, onClose, containerRef: panelRef });

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<StorageObjectIcon>('fridge');
  const [saving, setSaving] = useState(false);

  function reset() {
    setName('');
    setIcon('fridge');
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('이름을 입력해주세요'); return; }
    setSaving(true);
    // 여러 오브젝트를 연달아 추가해도 보드 중앙에 겹치지 않도록 약간의 랜덤 오프셋
    const posX = 50 + (Math.random() * 20 - 10);
    const posY = 50 + (Math.random() * 20 - 10);
    const res = await createStorageObject(name.trim(), icon, posX, posY);
    setSaving(false);
    if (res.success) {
      toast.success(`${name} 추가 완료`);
      reset();
      onSuccess();
      onClose();
    } else {
      toast.error(`추가 실패: ${res.error}`);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
        >
          <motion.div
            key="modal"
            ref={panelRef}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="bg-canvas w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <h2 className="text-[15px] font-extrabold text-ink">오브젝트 추가</h2>
              <button type="button" onClick={onClose} aria-label="닫기" className="text-ink-faint hover:text-ink-muted text-xl leading-none cursor-pointer transition">✕</button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); handleSave(); }}
              className="flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-4"
            >
              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1">이름</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="예: 주방 냉장고"
                  className="w-full border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary-700 transition"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-ink-muted block mb-1.5">종류</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STORAGE_ICONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIcon(opt.value)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[11px] font-bold cursor-pointer border-none transition ${
                        icon === opt.value ? 'bg-primary-700 text-white' : 'bg-[#f5f6f7] text-ink-muted hover:bg-primary-50'
                      }`}
                    >
                      <span className="text-lg leading-none">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit" disabled={saving}
                className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
              >
                {saving ? '추가 중…' : '오브젝트 추가'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
