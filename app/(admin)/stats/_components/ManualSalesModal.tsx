'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { saveManualSales, fetchManualSalesByDate, removeManualSales } from '@/app/actions';
import { formatPrice } from '@/lib/utils';

interface Props {
  date: string;
  existingRevenue: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function ManualSalesModal({ date, existingRevenue, onClose, onSaved }: Props) {
  const [revenue, setRevenue] = useState('');
  const [orders, setOrders] = useState('');
  const [note, setNote] = useState('');
  const [existingId, setExistingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const r = await fetchManualSalesByDate(date);
      if (cancelled) return;
      if (r.success && r.data) {
        setRevenue(String(r.data.total_revenue));
        setOrders(String(r.data.total_orders));
        setNote(r.data.note ?? '');
        setExistingId(r.data.id);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rev = Number(revenue.replace(/,/g, ''));
    const ord = Number(orders) || 0;
    if (revenue.trim() === '' || isNaN(rev) || rev < 0) { toast.error('올바른 매출액을 입력하세요'); return; }

    setIsSubmitting(true);
    const r = await saveManualSales(date, rev, ord, note.trim() || null);
    if (r.success) {
      toast.success('저장됐습니다');
      onClose();
      onSaved();
    } else {
      toast.error(r.error || '저장 실패');
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingId) return;
    setIsSubmitting(true);
    const r = await removeManualSales(existingId);
    if (r.success) {
      toast.success('삭제됐습니다');
      onClose();
      onSaved();
    } else {
      toast.error(r.error || '삭제 실패');
      setIsSubmitting(false);
    }
  };

  const [y, m, d] = date.split('-');
  const dateLabel = `${y}년 ${Number(m)}월 ${Number(d)}일`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="m-0 text-base font-extrabold text-[#111]">{dateLabel}</h3>
            <p className="m-0 mt-0.5 text-xs text-[#888]">수동 매출 입력</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:bg-[#f0f0f0] text-xl leading-none">×</button>
        </div>

        {existingRevenue > 0 && !isLoading && !existingId && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-[#f0fdf4] border border-green-200 text-xs text-green-700 font-semibold">
            POS 매출 {formatPrice(existingRevenue)}원 기록됨 — 추가 입력 가능
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-[#999] py-4 text-center">불러오는 중...</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#555]">매출액 (원)</label>
              <input
                type="number"
                min={0}
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="0"
                autoFocus
                className="border border-[#ddd] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#555]">주문 건수</label>
              <input
                type="number"
                min={0}
                value={orders}
                onChange={(e) => setOrders(e.target.value)}
                placeholder="0"
                className="border border-[#ddd] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#555]">메모 (선택)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 현금 판매, 외부 행사 등"
                className="border border-[#ddd] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              />
            </div>

            <div className="flex gap-2 mt-1">
              {existingId && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-lg border border-rose-200 text-rose-500 text-sm font-bold hover:bg-rose-50 transition disabled:opacity-50"
                >
                  삭제
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-lg bg-primary-700 text-white text-sm font-bold hover:bg-primary-800 transition disabled:opacity-50"
              >
                {isSubmitting ? '저장 중...' : existingId ? '수정' : '저장'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
