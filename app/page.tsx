'use client';

import NavBar from '@/components/NavBar';
import SalesBanner from '@/components/SalesBanner';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { fetchMenuItems, saveOrder, fetchTodaysOrdersWithItems, fetchTodaysSales, fetchPendingOrders, markOrderPrepared } from './actions';
import type { MenuItem } from '@/types/database';
import { supabase, type OrderItemInput } from '@/lib/supabase';
import type { SaveOrderResponse, OrderRecordWithItems, TodaysSales } from '@/types/api';
import { formatPrice, getShortcutBadgeColors } from '@/lib/utils';

function formatKSTTime(isoString: string): string {
  const s = isoString.replace(' ', 'T');
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
  const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

function fireConfetti() {
  const colors = ['#f43f5e', '#fb7185', '#fda4af', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { x: 0.5, y: 0.55 },
    colors,
    startVelocity: 42,
    gravity: 1.1,
    ticks: 100,
    scalar: 1.1,
  });
  setTimeout(() => {
    confetti({ particleCount: 55, spread: 58, origin: { x: 0.18, y: 0.62 }, angle: 65, colors, startVelocity: 36, gravity: 1.1, ticks: 80 });
    confetti({ particleCount: 55, spread: 58, origin: { x: 0.82, y: 0.62 }, angle: 115, colors, startVelocity: 36, gravity: 1.1, ticks: 80 });
  }, 110);
  setTimeout(() => {
    confetti({ particleCount: 35, spread: 100, origin: { x: 0.5, y: 0.48 }, colors, startVelocity: 22, gravity: 0.75, ticks: 70, scalar: 0.85 });
  }, 240);
}

const CASHIER_NAME_KEY = 'choichoi_cashier_name';

// ── 애니메이션 variants ────────────────────────────────────────────
const menuGridVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};

const menuCardVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

const viewVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const cartItemVariants: Variants = {
  hidden: { opacity: 0, height: 0, marginBottom: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15 } },
};

const pendingCardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.94, y: -4, transition: { duration: 0.18 } },
};
// ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [todaySales, setTodaySales] = useState<TodaysSales>({ totalRevenue: 0, totalOrders: 0 });
  const [flashKey, setFlashKey] = useState(0);
  const [lastPayment, setLastPayment] = useState<{ amount: number; id: number } | null>(null);
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [activeCashiers, setActiveCashiers] = useState<string[]>([]);
  const [view, setView] = useState<'pos' | 'orders'>('pos');
  const lastPaymentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientId = useMemo(() => Math.random().toString(36).slice(2, 10), []);

  useEffect(() => {
    setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
  }, []);

  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['today-orders-recent'] });
        queryClient.invalidateQueries({ queryKey: ['today-sales'] });
        queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-orders'] });
        queryClient.invalidateQueries({ queryKey: ['today-orders-recent'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  useEffect(() => {
    if (!cashierName) return () => {};
    const channel = supabase.channel('pos-presence', {
      config: { presence: { key: clientId } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = [...new Set(Object.values(state).flat().map((p) => p.name))];
        setActiveCashiers(names);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: cashierName });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [cashierName, clientId]);

  const checkoutFnRef = useRef<(() => void) | null>(null);
  const checkoutDebouncingRef = useRef(false);

  const salesQuery = useQuery<TodaysSales>({
    queryKey: ['today-sales'],
    queryFn: async () => {
      const result = await fetchTodaysSales();
      if (!result.success) throw new Error(result.error || '매출 로딩 실패');
      return result.data ?? { totalRevenue: 0, totalOrders: 0 };
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (salesQuery.data) setTodaySales(salesQuery.data);
  }, [salesQuery.data]);

  const menuQuery = useQuery<MenuItem[]>({
    queryKey: ['menu-items'],
    queryFn: async () => {
      const result = await fetchMenuItems();
      if (!result.success) throw new Error(result.error || '메뉴 로딩 실패');
      return result.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  });

  const menuItems = useMemo(() => menuQuery.data ?? [], [menuQuery.data]);

  const recentOrdersQuery = useQuery<OrderRecordWithItems[]>({
    queryKey: ['today-orders-recent'],
    queryFn: async () => {
      const result = await fetchTodaysOrdersWithItems(10);
      if (!result.success) throw new Error(result.error || '최근 주문 로딩 실패');
      return result.data ?? [];
    },
    staleTime: 30_000,
  });
  const recentOrders = useMemo(() => (recentOrdersQuery.data ?? []).slice(0, 5), [recentOrdersQuery.data]);

  const pendingOrdersQuery = useQuery<OrderRecordWithItems[]>({
    queryKey: ['pending-orders'],
    queryFn: async () => {
      const result = await fetchPendingOrders();
      if (!result.success) throw new Error(result.error || '미처리 주문 로딩 실패');
      return result.data ?? [];
    },
    staleTime: 0,
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

  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts]
  );

  const totalPrice = useMemo(
    () => menuItems.reduce((sum, item) => sum + item.price * (counts[item.id] ?? 0), 0),
    [counts, menuItems]
  );

  const orderedItems = useMemo(
    () => menuItems.filter((item) => (counts[item.id] ?? 0) > 0),
    [counts, menuItems]
  );

  const increase = useCallback((id: number) =>
    setCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 })), []);

  const decrease = useCallback((id: number) =>
    setCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) - 1) })), []);

  const resetOrder = useCallback(() => setCounts({}), []);

  const checkoutMutation = useMutation<
    SaveOrderResponse,
    Error,
    { items: OrderItemInput[]; totalPrice: number; cashierName?: string },
    { previousCounts: Record<number, number> }
  >({
    mutationFn: ({ items, totalPrice, cashierName: name }) => saveOrder(items, totalPrice, name ?? undefined),
    onMutate: () => {
      const previousCounts = { ...counts };
      resetOrder();
      return { previousCounts };
    },
    onSuccess: (result, vars, context) => {
      if (result.success) {
        const label = result.dailyOrderNumber ? `오늘 ${result.dailyOrderNumber}번째 주문` : `주문번호: ${result.orderId}`;
        toast.success(`결제 완료! ${label}`);

        if (result.sales) setTodaySales(result.sales);
        setFlashKey((k) => k + 1);

        if (lastPaymentTimerRef.current) clearTimeout(lastPaymentTimerRef.current);
        setLastPayment({ amount: vars.totalPrice, id: Date.now() });
        lastPaymentTimerRef.current = setTimeout(() => setLastPayment(null), 2000);

        fireConfetti();
        queryClient.invalidateQueries({ queryKey: ['today-orders-recent'] });
      } else {
        if (context?.previousCounts) setCounts(context.previousCounts);
        toast.error(result.error || '결제 오류가 발생했습니다');
      }
    },
    onError: (_error, _vars, context) => {
      if (context?.previousCounts) setCounts(context.previousCounts);
      toast.error('네트워크 오류로 결제가 취소되었습니다');
    },
  });

  const handleCheckout = () => {
    if (checkoutMutation.isPending) return;
    if (totalPrice === 0) { toast.warning('주문하신 항목이 없습니다'); return; }
    const items = menuItems
      .filter((item) => counts[item.id] > 0)
      .map((item) => ({ id: item.id, name: item.name, price: item.price, count: counts[item.id] }));
    checkoutMutation.mutate({ items, totalPrice, cashierName: cashierName ?? undefined });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable
      );
      if (isTyping) return;

      if (event.key === 'Escape') { event.preventDefault(); resetOrder(); return; }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (checkoutDebouncingRef.current) return;
        checkoutDebouncingRef.current = true;
        setTimeout(() => { checkoutDebouncingRef.current = false; }, 2000);
        checkoutFnRef.current?.();
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const targetItem = menuItems[Number(event.key) - 1];
        if (!targetItem) return;
        event.preventDefault();
        increase(targetItem.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuItems, resetOrder, increase]);

  useEffect(() => {
    checkoutFnRef.current = handleCheckout;
  });

  return (
    <>
      <NavBar />

      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        {/* 상단 결제 대기 헤더 */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-white mt-[-10px] rounded-2xl p-3 md:p-4 mb-2 md:mb-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
        >
          <div className="rounded-xl p-3 bg-[#fff5f5] border-2 border-rose-500 mb-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full bg-rose-500 text-white">결제 대기</span>
                <span className="text-[11px] font-semibold text-[#aaa]">{totalCount}개</span>
              </div>
              <button
                className="text-[11px] font-bold text-rose-400 border border-rose-200 rounded-lg px-2 py-0.5 bg-white cursor-pointer transition-all duration-200 hover:bg-rose-50 active:scale-95"
                onClick={resetOrder}
              >
                초기화
              </button>
            </div>
            <motion.div
              key={totalPrice}
              initial={{ scale: 1.04 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              className="text-[clamp(22px,6vw,36px)] font-black text-rose-500 leading-[1.1]"
            >
              {formatPrice(totalPrice)}원
            </motion.div>
          </div>
          {activeCashiers.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[11px] text-[#bbb] shrink-0">접속 중</span>
              {activeCashiers.map((name) => (
                <span key={name} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {name}
                </span>
              ))}
            </div>
          )}
          {/* 탭 전환 버튼 */}
          <div className="flex gap-2 mt-2 pt-2 border-t border-[#f0f0f0]">
            <button
              className={`flex-1 py-2 rounded-lg text-[13px] font-bold border cursor-pointer transition-all duration-200 ${view === 'pos' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-[#555] border-[#ddd] hover:bg-[#f5f5f5]'}`}
              onClick={() => setView('pos')}
            >
              주문 입력
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-[13px] font-bold border cursor-pointer transition-all duration-200 relative ${view === 'orders' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-[#555] border-[#ddd] hover:bg-[#f5f5f5]'}`}
              onClick={() => setView('orders')}
            >
              주문 현황
              <AnimatePresence>
                {pendingOrders.length > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black leading-[18px] text-center"
                  >
                    {pendingOrders.length}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </motion.header>

        {/* 뷰 전환 애니메이션 */}
        <AnimatePresence mode="wait">
          {view === 'pos' ? (
            <motion.div
              key="pos"
              variants={viewVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* 메뉴 그리드 */}
              <motion.section
                className="grid grid-cols-2 gap-1.5 md:gap-2 mb-3"
                aria-label="메뉴 목록"
                variants={menuGridVariants}
                initial="hidden"
                animate="visible"
              >
                {menuQuery.isLoading && menuItems.length === 0 && (
                  <p className="m-0 text-[#999] text-sm">메뉴를 불러오는 중입니다...</p>
                )}
                {menuItems.map((item, index) => {
                  const count = counts[item.id] ?? 0;
                  const shortcutNumber = index + 1;
                  const hasShortcut = shortcutNumber <= 9;
                  const badgeStyle = getShortcutBadgeColors(item.color);
                  return (
                    <motion.article
                      key={item.id}
                      variants={menuCardVariants}
                      whileTap={{ scale: 0.97 }}
                      className={`relative bg-white rounded-xl p-3 md:p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow duration-200 hover:shadow-[0_4px_14px_rgba(0,0,0,0.12)] ${count > 0 ? 'bg-primary-50 shadow-none ring-[3px] ring-primary-700' : ''}`}
                    >
                      {hasShortcut && (
                        <strong
                          className="absolute top-2 right-2 md:right-2.5 min-w-[28px] h-[28px] px-2 rounded-full border border-black/15 text-base font-black leading-[28px] text-center z-10 shadow-[0_1px_4px_rgba(0,0,0,0.16)]"
                          style={badgeStyle}
                          aria-label={`${item.name} 단축키 ${shortcutNumber}번`}
                        >
                          {shortcutNumber}
                        </strong>
                      )}
                      <button className="w-full border-none bg-transparent text-left p-0 cursor-pointer mb-3" onClick={() => increase(item.id)}>
                        <div className="flex items-center gap-2.5 mb-2">
                          <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0 border-2 border-black/10" style={{ backgroundColor: item.color }} />
                          <h2 className="m-0 text-sm md:text-base font-bold leading-snug">{item.name}</h2>
                        </div>
                        <p className="m-0 text-xl md:text-2xl font-extrabold text-[#333]">{formatPrice(item.price)}원</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-[#ddd] text-xl md:text-2xl font-semibold cursor-pointer bg-[#fafafa] transition-all duration-200 hover:bg-[#f0f0f0] hover:border-[#999] active:scale-95 leading-none"
                          onClick={() => decrease(item.id)}
                          aria-label={`${item.name} 수량 감소`}
                        >
                          −
                        </button>
                        <motion.strong
                          key={count}
                          initial={{ scale: 1.25 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                          className={`flex-1 text-base md:text-lg font-bold text-center ${count > 0 ? 'text-primary-700' : 'text-[#333]'}`}
                        >
                          {count}개
                        </motion.strong>
                        <button
                          className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-[#ddd] text-xl md:text-2xl font-semibold cursor-pointer bg-[#fafafa] transition-all duration-200 hover:bg-[#f0f0f0] hover:border-[#999] active:scale-95 leading-none"
                          onClick={() => increase(item.id)}
                          aria-label={`${item.name} 수량 증가`}
                        >
                          +
                        </button>
                      </div>
                    </motion.article>
                  );
                })}
              </motion.section>

              {/* 주문 상세 */}
              <section className="bg-white rounded-xl p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] mb-3" aria-label="주문 상세">
                <h2 className="m-0 mb-2 text-sm md:text-base font-bold">주문 상세</h2>
                {orderedItems.length === 0 ? (
                  <p className="m-0 text-[#999] text-sm">{checkoutMutation.isPending ? '결제 처리 중...' : '선택한 메뉴가 없습니다.'}</p>
                ) : (
                  <ul className="m-0 p-0 list-none overflow-hidden">
                    <AnimatePresence initial={false}>
                      {orderedItems.map((item, index) => {
                        const count = counts[item.id];
                        return (
                          <motion.li
                            key={item.id}
                            variants={cartItemVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className={`flex justify-between items-center py-2.5 text-sm ${index !== orderedItems.length - 1 ? 'border-b border-[#f0f0f0]' : ''}`}
                          >
                            <span>{item.name} × {count}</span>
                            <strong className="font-bold text-primary-500">{formatPrice(item.price * count)}원</strong>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
                <button
                  className="w-full p-3 mt-3 text-base font-bold bg-primary-700 text-white border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary-800 hover:-translate-y-0.5 active:scale-[0.98] disabled:bg-[#ccc] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#ccc] disabled:hover:translate-y-0"
                  onClick={handleCheckout}
                  disabled={checkoutMutation.isPending || orderedItems.length === 0}
                >
                  {checkoutMutation.isPending ? '처리 중...' : '결제하기'}
                </button>
              </section>

              {/* 최근 주문 */}
              <section className="bg-white rounded-xl mb-4 p-3.5 md:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]" aria-label="최근 주문">
                <h2 className="m-0 mb-3 text-base md:text-lg font-bold text-[#333]">최근 주문</h2>
                {recentOrdersQuery.isLoading ? (
                  <p className="m-0 text-[#999] text-sm">불러오는 중...</p>
                ) : recentOrders.length === 0 ? (
                  <p className="m-0 text-[#999] text-sm">오늘 주문 내역이 없습니다.</p>
                ) : (
                  <ul className="m-0 p-0 list-none">
                    {recentOrders.map((order, index) => (
                      <li key={order.id} className={`py-2.5 ${index !== recentOrders.length - 1 ? 'border-b border-[#f0f0f0]' : ''}`}>
                        <div className="flex justify-between items-center mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#888] text-xs font-medium">{formatKSTTime(order.created_at)}</span>
                            {order.cashier_name && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f0f0] text-[#666]">{order.cashier_name}</span>
                            )}
                          </div>
                          <strong className="text-sm font-bold text-primary-700">{formatPrice(order.total_price)}원</strong>
                        </div>
                        <p className="m-0 text-[#555] text-xs truncate">
                          {order.items.length > 0 ? order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ') : '-'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <SalesBanner
                totalRevenue={todaySales.totalRevenue}
                totalOrders={todaySales.totalOrders}
                flashKey={flashKey}
                lastPayment={lastPayment}
              />
            </motion.div>
          ) : (
            <motion.div
              key="orders"
              variants={viewVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <section aria-label="주문 현황">
                {pendingOrdersQuery.isLoading ? (
                  <p className="m-0 text-[#999] text-sm py-4 text-center">불러오는 중...</p>
                ) : pendingOrders.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-xl p-8 shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-center"
                  >
                    <p className="m-0 text-[#aaa] text-sm">대기 중인 주문이 없습니다.</p>
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
                          className="bg-white rounded-xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[#888] text-xs font-medium">{formatKSTTime(order.created_at)}</span>
                              {order.cashier_name && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f0f0f0] text-[#666]">{order.cashier_name}</span>
                              )}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">대기 중</span>
                            </div>
                            <strong className="text-sm font-bold text-primary-700 shrink-0 ml-2">{formatPrice(order.total_price)}원</strong>
                          </div>
                          <ul className="m-0 p-0 list-none mb-3">
                            {order.items.map((item, idx) => (
                              <li key={idx} className="flex justify-between items-center py-1.5 border-b border-[#f5f5f5] last:border-0">
                                <span className="text-sm font-semibold text-[#333]">{item.name}</span>
                                <span className="text-sm text-[#888]">× {item.quantity}</span>
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
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  );
}
