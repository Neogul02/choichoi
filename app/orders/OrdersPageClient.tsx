'use client';

import NavBar from '@/components/NavBar';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { fetchPendingOrders, markOrderPrepared } from '@/app/actions/orders';
import { supabase } from '@/lib/supabase';
import type { OrderRecordWithItems } from '@/types/api';
import { formatKSTTime, formatPrice } from '@/lib/utils';

const pendingCardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.94, y: -4, transition: { duration: 0.18 } },
};

// 서버 컴포넌트(page.tsx)가 쿠키의 popupId로 프리페치한 초기 데이터 — 없으면 기존 클라이언트 조회로 폴백
interface Props {
  initialPopupId: string | null;
  initialOrders: OrderRecordWithItems[] | null;
}

export default function OrdersPageClient({ initialPopupId, initialOrders }: Props) {
  const queryClient = useQueryClient();
  const [popupId, setPopupId] = useState(initialPopupId ?? '0');

  useEffect(() => {
    // localStorage가 원본 — 쿠키(initialPopupId)와 다르면 localStorage 값으로 교정
    setPopupId(localStorage.getItem('choichoi_popup_id') ?? '0');
  }, []);

  useEffect(() => {
    const filter = popupId !== '0' ? { filter: `popup_id=eq.${popupId}` } : {};
    const channel = supabase
      .channel(`orders-realtime-orders-page-${popupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', ...filter }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', ...filter }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, popupId]);

  const pendingOrdersQuery = useQuery<OrderRecordWithItems[]>({
    queryKey: ['pending-orders', popupId],
    queryFn: async () => {
      const result = await fetchPendingOrders(popupId);
      if (!result.success) throw new Error(result.error || '미처리 주문 로딩 실패');
      return result.data ?? [];
    },
    ...(initialOrders != null && popupId === initialPopupId ? { initialData: initialOrders } : {}),
  });
  const pendingOrders = pendingOrdersQuery.data ?? [];

  const markPreparedMutation = useMutation<{ success: boolean; error?: string }, Error, number>({
    mutationFn: (orderId) => markOrderPrepared(orderId),
    onMutate: (orderId) => {
      queryClient.setQueryData<OrderRecordWithItems[]>(['pending-orders'], (prev) =>
        (prev ?? []).filter((o) => o.id !== orderId)
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      toast.error('처리 중 오류가 발생했습니다');
    },
  });

  return (
    <>
      <NavBar />
      <main className="min-h-screen p-3 md:p-5 max-w-[800px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex items-center justify-between bg-canvas mt-[-10px] rounded-xl px-4 py-3.5 md:px-5 mb-3 md:mb-4 shadow-level-1 border border-hairline"
        >
          <h1 className="m-0 text-lg font-black text-ink">주문 현황</h1>
          {pendingOrders.length > 0 && (
            <motion.span
              key={pendingOrders.length}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16 }}
              className="px-2.5 py-1 rounded-full bg-rose-500 text-white text-[12px] font-black"
            >
              {pendingOrders.length}건 대기
            </motion.span>
          )}
        </motion.div>

        <section aria-label="주문 현황">
          {pendingOrdersQuery.isLoading ? (
            <div className="animate-pulse flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline">
                  <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
                  <div className="h-9 bg-gray-100 rounded-lg w-full" />
                </div>
              ))}
            </div>
          ) : pendingOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-canvas rounded-xl p-8 shadow-level-1 text-center"
            >
              <p className="m-0 text-ink-faint text-sm">대기 중인 주문이 없습니다.</p>
            </motion.div>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {pendingOrders.map((order) => (
                  <motion.li
                    key={order.id}
                    variants={pendingCardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    className="bg-canvas rounded-xl p-4 shadow-level-1 border border-hairline"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-ink-muted text-xs font-medium">{formatKSTTime(order.created_at)}</span>
                        {order.cashier_name && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-ink-muted">{order.cashier_name}</span>
                        )}
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">대기 중</span>
                      </div>
                      <strong className="text-sm font-bold text-primary-700 shrink-0 ml-2">{formatPrice(order.total_price)}원</strong>
                    </div>
                    <ul className="m-0 p-0 list-none mb-3">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="flex justify-between items-center py-1.5 border-b border-[#f5f5f5] last:border-0">
                          <span className="text-sm font-semibold text-ink-secondary">{item.name}</span>
                          <span className="text-sm text-ink-muted">× {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      className="w-full py-2.5 rounded-lg border-none bg-emerald-500 text-white text-[13px] font-bold cursor-pointer transition-all duration-200 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => markPreparedMutation.mutate(order.id)}
                      disabled={markPreparedMutation.isPending}
                    >
                      확인
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
