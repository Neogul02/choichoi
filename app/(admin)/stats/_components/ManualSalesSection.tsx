'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { saveManualSales, fetchManualSalesForMonth, removeManualSales } from '@/app/actions';
import { formatPrice } from '@/lib/utils';
import type { ManualSalesEntry } from '@/types/api';

interface Props {
  calendarMonth: Date;
  onSaved: () => void;
}

export default function ManualSalesSection({ calendarMonth, onSaved }: Props) {
  const [entries, setEntries] = useState<ManualSalesEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [date, setDate] = useState('');
  const [revenue, setRevenue] = useState('');
  const [orders, setOrders] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    const r = await fetchManualSalesForMonth(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1);
    if (r.success && r.data) setEntries(r.data);
    setIsLoading(false);
  }, [calendarMonth]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { toast.error('날짜를 선택하세요'); return; }
    const rev = Number(revenue.replace(/,/g, ''));
    const ord = Number(orders);
    if (isNaN(rev) || rev < 0) { toast.error('올바른 매출액을 입력하세요'); return; }
    if (isNaN(ord) || ord < 0) { toast.error('올바른 주문 건수를 입력하세요'); return; }

    setIsSubmitting(true);
    const r = await saveManualSales(date, rev, ord, note.trim() || null);
    if (r.success) {
      toast.success('저장됐습니다');
      setDate(''); setRevenue(''); setOrders(''); setNote('');
      await load();
      onSaved();
    } else {
      toast.error(r.error || '저장 실패');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    const r = await removeManualSales(id);
    if (r.success) {
      toast.success('삭제됐습니다');
      setEntries((prev) => prev.filter((e) => e.id !== id));
      onSaved();
    } else {
      toast.error(r.error || '삭제 실패');
    }
  };

  const handleEdit = (entry: ManualSalesEntry) => {
    setDate(entry.sale_date);
    setRevenue(String(entry.total_revenue));
    setOrders(String(entry.total_orders));
    setNote(entry.note ?? '');
  };

  return (
    <div>
      <h3 className="m-0 mb-3 text-base font-bold text-[#333]">수동 매출 입력</h3>
      <p className="m-0 mb-4 text-xs text-[#888]">포스기를 사용하지 않은 날의 매출을 직접 입력할 수 있어요. 같은 날짜로 저장하면 덮어씁니다.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 mb-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#555]">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-[#ddd] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
              required
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
              className="border border-[#ddd] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#555]">매출액 (원)</label>
          <input
            type="number"
            min={0}
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder="0"
            className="border border-[#ddd] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[#555]">메모 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 현금 판매, 외부 행사 등"
            className="border border-[#ddd] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 w-full py-2.5 rounded-lg bg-primary-700 text-white text-sm font-bold transition hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? '저장 중...' : '저장'}
        </button>
      </form>

      <div>
        <h4 className="m-0 mb-2 text-sm font-semibold text-[#555]">
          {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월 수동 입력 내역
        </h4>
        {isLoading ? (
          <p className="text-xs text-[#999]">불러오는 중...</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-[#bbb]">입력된 내역이 없습니다.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 bg-[#f9f9f9] rounded-lg px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-[#333]">{entry.sale_date}</span>
                  <span className="text-sm font-extrabold text-primary-700">{formatPrice(entry.total_revenue)}원</span>
                  <span className="text-xs text-[#888]">{entry.total_orders}건{entry.note ? ` · ${entry.note}` : ''}</span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEdit(entry)}
                    className="text-xs px-2.5 py-1 rounded-md border border-[#ddd] bg-white text-[#555] hover:bg-[#f0f0f0] transition"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-xs px-2.5 py-1 rounded-md border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 transition"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
