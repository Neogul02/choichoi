'use client';

import { useState } from 'react';
import SectionHeader from './SectionHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import { utcToKst } from '@/lib/date';
import type { OrderRecordWithItems } from '@/types/api';

interface Props {
  /** 접혀 있으면 조회하지 않는다 — 오늘 주문 전체(품목 포함)는 가장 무거운 조회 */
  open: boolean;
  onToggle: () => void;
  orders: OrderRecordWithItems[];
  todayRevenue: number;
  isLoading: boolean;
  onDeleteOrder: (id: number) => Promise<void>;
}

function formatKSTTime(isoString: string): string {
  const kst = utcToKst(isoString);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

export default function TodayOrdersSection({ open, onToggle, orders, todayRevenue, isLoading, onDeleteOrder }: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderRecordWithItems | null>(null);

  const handleDelete = (order: OrderRecordWithItems) => setDeleteTarget(order);

  const confirmDelete = async () => {
    const order = deleteTarget;
    if (!order) return;
    setDeleteTarget(null);
    setDeletingId(order.id);
    await onDeleteOrder(order.id);
    setDeletingId(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="mt-4 w-full flex items-center justify-between rounded-lg border border-hairline bg-canvas-soft px-3 py-2.5 text-[12px] font-bold text-ink-secondary cursor-pointer hover:bg-canvas-strong"
      >
        오늘 주문 목록 <span className="text-ink-faint font-semibold">펼치기 ▾</span>
      </button>
    );
  }

  return (
    <div className="mt-4">
      <SectionHeader
        title="오늘 주문 내역"
        right={
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-ink-faint font-medium">오늘 {orders.length}건</div>
              <strong className="text-base text-primary-700 font-extrabold tabular-nums">₩{todayRevenue.toLocaleString('ko-KR')}</strong>
            </div>
            <button type="button" onClick={onToggle} className="text-[11px] font-semibold text-ink-faint bg-transparent border-none cursor-pointer hover:text-ink-muted">접기 ▴</button>
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
                <div className="flex justify-between items-center gap-2 mb-0.5">
                  {/* 좁은 화면에서 뱃지가 가격을 밀어내지 않도록 — 시간은 고정, 뱃지는 줄여서 말줄임 */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-ink-muted text-xs font-medium shrink-0 tabular-nums">{formatKSTTime(order.created_at)}</span>
                    {order.popup_name && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted border border-hairline truncate max-w-[96px]">{order.popup_name}</span>
                    )}
                    {order.cashier_name && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas text-ink-muted border border-hairline truncate max-w-[72px]">{order.cashier_name}</span>
                    )}
                  </div>
                  <strong className="text-sm font-bold shrink-0 tabular-nums">₩{Number(order.total_price).toLocaleString('ko-KR')}</strong>
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
      <ConfirmDialog
        open={deleteTarget != null}
        title="이 주문을 삭제하시겠습니까?"
        description={deleteTarget
          ? `${formatKSTTime(deleteTarget.created_at)} / ₩${Number(deleteTarget.total_price).toLocaleString('ko-KR')} — 이 작업은 되돌릴 수 없습니다.`
          : undefined}
        confirmLabel="삭제"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
