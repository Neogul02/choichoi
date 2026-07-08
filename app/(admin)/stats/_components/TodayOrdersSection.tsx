'use client';

import { useState } from 'react';
import SectionHeader from './SectionHeader';
import type { OrderRecordWithItems } from '@/types/api';

interface Props {
  orders: OrderRecordWithItems[];
  todayRevenue: number;
  isLoading: boolean;
  onDeleteOrder: (id: number) => Promise<void>;
}

function formatKSTTime(isoString: string): string {
  const s = isoString.replace(' ', 'T');
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
  const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

export default function TodayOrdersSection({ orders, todayRevenue, isLoading, onDeleteOrder }: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (order: OrderRecordWithItems) => {
    const label = `${formatKSTTime(order.created_at)} / ₩${Number(order.total_price).toLocaleString('ko-KR')}`;
    if (!window.confirm(`이 주문을 삭제하시겠습니까?\n${label}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingId(order.id);
    await onDeleteOrder(order.id);
    setDeletingId(null);
  };

  return (
    <div className="bg-canvas rounded-xl p-4 md:p-5 shadow-level-1 border border-hairline">
      <SectionHeader
        title="오늘 주문 내역"
        right={
          <div className="text-right">
            <div className="text-[10px] text-ink-faint font-medium">오늘 {orders.length}건</div>
            <strong className="text-base text-primary-700 font-extrabold tabular-nums">₩{todayRevenue.toLocaleString('ko-KR')}</strong>
          </div>
        }
      />
      {isLoading ? (
        <p className="text-sm text-ink-faint">주문 내역을 불러오는 중입니다...</p>
      ) : orders.length === 0 ? (
        <p className="m-0 text-ink-faint text-sm">오늘 주문 내역이 없습니다.</p>
      ) : (
        <ul className="m-0 p-0 list-none border border-hairline rounded-lg bg-canvas-soft max-h-[320px] overflow-y-auto">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center gap-2 p-2.5 md:p-3 border-b border-hairline last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted text-xs font-medium">{formatKSTTime(order.created_at)}</span>
                    {order.popup_name && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted border border-hairline">{order.popup_name}</span>
                    )}
                    {order.cashier_name && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted border border-hairline">{order.cashier_name}</span>
                    )}
                  </div>
                  <strong className="text-sm font-bold">₩{Number(order.total_price).toLocaleString('ko-KR')}</strong>
                </div>
                <p className="m-0 text-ink-muted text-xs truncate">
                  {order.items.length > 0 ? order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ') : '-'}
                </p>
              </div>
              <button
                className="shrink-0 px-2.5 py-1 rounded-md text-xs font-bold border-none bg-rose-500 text-white hover:bg-rose-600 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => handleDelete(order)}
                disabled={deletingId === order.id}
                aria-label={`${formatKSTTime(order.created_at)} 주문 삭제`}
              >
                {deletingId === order.id ? '…' : '삭제'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
