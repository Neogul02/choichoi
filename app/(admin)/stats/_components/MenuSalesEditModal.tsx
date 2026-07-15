'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { fetchMenuItems } from '@/app/actions/menu';
import { fetchManualMenuSales, saveManualMenuSales } from '@/app/actions/stats';
import { formatPrice } from '@/lib/utils';
import type { MenuItem } from '@/types/database';

interface Props {
  popupId: number;
  popupName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function MenuSalesEditModal({ popupId, popupName, onClose, onSaved }: Props) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchMenuItems(), fetchManualMenuSales(popupId)]).then(([itemsRes, manualRes]) => {
      if (itemsRes.success && itemsRes.data) setMenuItems(itemsRes.data);
      else if (!itemsRes.success) toast.error(`메뉴 조회 실패: ${itemsRes.error}`);

      if (manualRes.success && manualRes.data) {
        const initial: Record<number, number> = {};
        for (const entry of manualRes.data) initial[entry.id] = entry.totalQuantity;
        setQuantities(initial);
      }
      setLoading(false);
    });
  }, [popupId]);

  const totalRevenue = menuItems.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * item.price, 0);

  const handleQuantityChange = (id: number, raw: string) => {
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    setQuantities((prev) => ({ ...prev, [id]: isNaN(n) ? 0 : n }));
  };

  const handleSave = async () => {
    setSaving(true);
    const entries = menuItems.map((item) => ({ menuItemId: item.id, quantity: quantities[item.id] ?? 0 }));
    const result = await saveManualMenuSales(popupId, entries);
    setSaving(false);
    if (!result.success) { toast.error(`저장 실패: ${result.error}`); return; }
    toast.success('저장됐습니다.');
    onSaved();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="menu-sales-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="menu-sales-modal-panel"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-canvas w-full sm:max-w-[420px] rounded-t-2xl sm:rounded-xl shadow-level-2 border border-hairline overflow-hidden max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <div>
              <p className="text-[11px] text-ink-faint font-medium mb-0.5">메뉴별 판매 수기 입력</p>
              <h3 className="m-0 text-[17px] font-bold text-ink">{popupName}</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-canvas-soft text-ink-faint transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
            {loading ? (
              <p className="text-sm text-ink-faint py-6 text-center">불러오는 중...</p>
            ) : menuItems.length === 0 ? (
              <p className="text-sm text-ink-faint py-6 text-center">등록된 메뉴가 없습니다.</p>
            ) : (
              <section>
                <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">팝업 기간 전체 판매 수량</p>
                <div className="flex flex-col gap-1.5">
                  {menuItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[13px] text-ink-secondary truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={quantities[item.id] ? String(quantities[item.id]) : ''}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="0"
                          className="w-16 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                        />
                        <span className="text-[12px] text-ink-faint">개</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="px-4 py-3 border-t border-hairline flex items-center justify-between gap-2 shrink-0">
            <div className="text-[12px] text-ink-muted">
              예상 매출 <strong className="text-[13px] text-primary-700">₩{formatPrice(totalRevenue)}</strong>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-hairline bg-canvas text-[13px] font-semibold text-ink-muted hover:bg-canvas-soft transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-4 py-2.5 rounded-lg bg-primary-700 text-white text-[13px] font-bold hover:bg-primary-800 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
