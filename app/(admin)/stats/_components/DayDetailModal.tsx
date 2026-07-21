'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchOrdersByDate } from '@/app/actions/stats';
import { formatPrice } from '@/lib/utils';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import type { ManualSalesEntry, OrderRecordWithItems } from '@/types/api';

interface Props {
  date: string;
  manualEntry: ManualSalesEntry | undefined;
  onSaved: () => void;
  onClose: () => void;
  saveDay: (date: string, revenue: number, orders: number, note: string | null) => Promise<boolean>;
  removeDay: (id: number) => Promise<void>;
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${m}월 ${d}일 (${days[day]})`;
}

export default function DayDetailModal({ date, manualEntry, onSaved, onClose, saveDay, removeDay }: Props) {
  useBodyScrollLock();
  const [orders, setOrders] = useState<OrderRecordWithItems[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [revenue, setRevenue] = useState(manualEntry?.total_revenue ?? 0);
  const [orderCount, setOrderCount] = useState(manualEntry?.total_orders ?? 0);
  const [note, setNote] = useState(manualEntry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const revenueRef = useRef<HTMLInputElement>(null);

  const posRevenue = orders.reduce((s, o) => s + Number(o.total_price), 0);

  useEffect(() => {
    fetchOrdersByDate(date).then((res) => {
      if (res.success && res.data) setOrders(res.data);
      setLoadingOrders(false);
    });
  }, [date]);

  useEffect(() => {
    setTimeout(() => revenueRef.current?.focus(), 120);
  }, []);

  const menuAgg = orders.reduce<Record<string, { name: string; qty: number; subtotal: number }>>((acc, order) => {
    for (const item of order.items) {
      if (!acc[item.menu_item_id]) acc[item.menu_item_id] = { name: item.name, qty: 0, subtotal: 0 };
      acc[item.menu_item_id].qty += item.quantity;
      acc[item.menu_item_id].subtotal += item.subtotal;
    }
    return acc;
  }, {});

  const handleSave = async () => {
    setSaving(true);
    const ok = await saveDay(date, revenue, orderCount, note.trim() || null);
    setSaving(false);
    if (ok) onSaved();
  };

  const handleDelete = async () => {
    if (!manualEntry) return;
    setDeleting(true);
    await removeDay(manualEntry.id);
    setDeleting(false);
    onSaved();
  };

  const formatCostInput = (v: number) => (v === 0 ? '' : v.toLocaleString('ko-KR'));
  const parseCostInput = (s: string) => { const n = parseInt(s.replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; };

  return (
    <AnimatePresence>
      <motion.div
        key="day-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="day-modal-panel"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-canvas w-full sm:max-w-[420px] rounded-t-2xl sm:rounded-xl shadow-level-2 border border-hairline overflow-hidden max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
            <div>
              <p className="text-[11px] text-ink-faint font-medium mb-0.5">날짜별 매출</p>
              <h3 className="m-0 text-[17px] font-bold text-ink">{formatDateLabel(date)}</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-canvas-soft text-ink-faint transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
            {/* POS 실매출 */}
            <section>
              <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide mb-2">POS 실매출</p>
              {loadingOrders ? (
                <p className="text-sm text-ink-faint py-3 text-center">불러오는 중...</p>
              ) : orders.length === 0 ? (
                <p className="text-sm text-ink-faint py-3 text-center">이 날짜에 주문 내역이 없습니다.</p>
              ) : (
                <div className="bg-canvas-soft rounded-lg border border-hairline overflow-hidden">
                  {Object.values(menuAgg).sort((a, b) => b.qty - a.qty).map((item) => (
                    <div key={item.name} className="flex items-center justify-between px-3 py-2 border-b border-hairline last:border-0">
                      <span className="text-[13px] text-ink-secondary">{item.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-ink-faint">{item.qty}개</span>
                        <span className="text-[13px] font-semibold text-ink">₩{formatPrice(item.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-canvas">
                    <span className="text-[13px] font-bold text-ink">합계 ({orders.length}건)</span>
                    <span className="text-[14px] font-extrabold text-primary-700">₩{formatPrice(posRevenue)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* 커스텀 입력 */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[11px] text-ink-faint font-semibold uppercase tracking-wide">커스텀 매출 입력</p>
                {manualEntry && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">저장됨</span>}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                  <span className="text-[13px] text-ink-secondary shrink-0">총 매출</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-ink-faint">₩</span>
                    <input
                      ref={revenueRef}
                      type="text"
                      inputMode="numeric"
                      value={formatCostInput(revenue)}
                      onChange={(e) => setRevenue(parseCostInput(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-28 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                  <span className="text-[13px] text-ink-secondary shrink-0">주문 수</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={orderCount === 0 ? '' : String(orderCount)}
                      onChange={(e) => { const n = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10); setOrderCount(isNaN(n) ? 0 : n); }}
                      onFocus={(e) => e.target.select()}
                      placeholder="0"
                      className="w-16 text-right text-[13px] font-semibold bg-transparent outline-none border-none text-ink"
                      style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    />
                    <span className="text-[12px] text-ink-faint">건</span>
                  </div>
                </div>
                <div className="bg-canvas-soft rounded-lg border border-hairline px-3 py-2.5">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="메모 (선택)"
                    maxLength={200}
                    className="w-full text-[13px] bg-transparent outline-none border-none text-ink placeholder:text-ink-faint"
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-hairline flex gap-2 shrink-0">
            {manualEntry && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2.5 rounded-lg border border-hairline text-[13px] font-semibold text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas text-[13px] font-semibold text-ink-muted hover:bg-canvas-soft transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-primary-700 text-white text-[13px] font-bold hover:bg-primary-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
