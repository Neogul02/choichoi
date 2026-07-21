'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { updateMenuStock } from '@/app/actions/menu';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import type { MenuItem } from '@/types/database';

interface Props {
  open: boolean;
  menuItems: MenuItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function MenuStockModal({ open, menuItems, onClose, onSuccess }: Props) {
  useBodyScrollLock(open);
  const [values, setValues] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(Object.fromEntries(menuItems.map((m) => [m.id, m.stock === null ? '' : String(m.stock)])));
    }
  }, [open, menuItems]);

  async function handleSave() {
    setSaving(true);
    const changed = menuItems.filter((m) => {
      const draft = values[m.id] ?? '';
      const current = m.stock === null ? '' : String(m.stock);
      return draft !== current;
    });

    const results = await Promise.all(changed.map((m) => {
      const raw = values[m.id]?.trim();
      const stock = raw === '' || raw === undefined ? null : parseInt(raw, 10);
      return updateMenuStock(m.id, Number.isNaN(stock as number) ? null : stock);
    }));

    setSaving(false);
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      toast.error(`${failed.length}개 항목 저장 실패`);
    } else if (changed.length > 0) {
      toast.success(`${changed.length}개 메뉴 재고 저장됨`);
    }
    onSuccess();
    onClose();
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
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="bg-canvas w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div>
                <h2 className="text-[15px] font-extrabold text-ink">재고 설정</h2>
                <p className="text-[11px] text-ink-faint mt-0.5">비워두면 재고를 추적하지 않습니다</p>
              </div>
              <button onClick={onClose} className="text-ink-faint hover:text-ink-muted text-xl leading-none cursor-pointer transition bg-transparent border-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2 divide-y divide-[#f5f5f5]">
              {menuItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-2.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[13px] font-semibold text-ink-secondary flex-1 truncate">{item.name}</span>
                  <input
                    type="number"
                    value={values[item.id] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [item.id]: e.target.value }))}
                    placeholder="추적 안 함"
                    className="w-24 border border-hairline rounded-lg text-sm text-center px-2 py-1.5 focus:outline-none focus:border-primary-700"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  />
                </div>
              ))}
            </div>

            <div className="px-5 pb-5 pt-3 shrink-0">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl cursor-pointer transition text-[13px] border-none"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
