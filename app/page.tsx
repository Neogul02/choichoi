'use client';

import NavBar from '@/components/NavBar';
import SalesBanner from '@/components/SalesBanner';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { fetchMenuItems, saveOrder, fetchTodaysOrdersWithItems, fetchTodaysSales } from './actions';
import type { MenuItem } from '@/types/database';
import type { OrderItemInput } from '@/lib/supabase';
import type { SaveOrderResponse, OrderRecordWithItems, TodaysSales } from '@/types/api';
import { formatPrice, getShortcutBadgeColors } from '@/lib/utils';

function formatKSTTime(isoString: string): string {
  const s = isoString.replace(' ', 'T');
  const hasOffset = s.endsWith('Z') || /[+-]\d{2}(?::\d{2})?$/.test(s);
  const utcMs = new Date(hasOffset ? s : s + 'Z').getTime();
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
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

export default function Home() {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [todaySales, setTodaySales] = useState<TodaysSales>({ totalRevenue: 0, totalOrders: 0 });
  const [flashKey, setFlashKey] = useState(0);
  const [lastPayment, setLastPayment] = useState<{ amount: number; id: number } | null>(null);
  const lastPaymentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const checkoutFnRef = useRef<(() => void) | null>(null);
  const checkoutDebouncingRef = useRef(false);

  // 오늘 매출 초기 로드
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
    { items: OrderItemInput[]; totalPrice: number },
    { previousCounts: Record<number, number> }
  >({
    mutationFn: ({ items, totalPrice }) => saveOrder(items, totalPrice),
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
    checkoutMutation.mutate({ items, totalPrice });
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



        <header className="bg-white rounded-2xl p-4 md:p-5 mb-3 md:mb-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 rounded-xl p-3.5 md:p-4 bg-[#fff5f5] border-2 border-rose-500">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full bg-rose-500 text-white">결제 대기</span>
                <span className="text-[11px] font-semibold text-[#aaa]">{totalCount}개</span>
              </div>
              <div className="text-[clamp(28px,8vw,44px)] md:text-[clamp(32px,5vw,56px)] font-black text-rose-500 leading-[1.1]">{formatPrice(totalPrice)}원</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[#999] text-[12px] md:text-[13px]">
              1~9: 추가&nbsp;·&nbsp;Enter: 결제&nbsp;·&nbsp;Esc: 초기화
            </p>
            <button
              className="shrink-0 border-none rounded-lg px-3.5 py-2 text-[13px] font-bold bg-[#f5f6f7] text-[#555] cursor-pointer transition-all duration-200 hover:bg-[#eee] active:scale-95"
              onClick={resetOrder}
            >
              초기화
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2 md:gap-2.5 mb-4" aria-label="메뉴 목록">
          {menuQuery.isLoading && menuItems.length === 0 && (
            <p className="m-0 text-[#999] text-sm">메뉴를 불러오는 중입니다...</p>
          )}
          {menuItems.map((item, index) => {
            const count = counts[item.id] ?? 0;
            const shortcutNumber = index + 1;
            const hasShortcut = shortcutNumber <= 9;
            const badgeStyle = getShortcutBadgeColors(item.color);
            return (
              <article
                key={item.id}
                className={`relative bg-white rounded-xl p-3 md:p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 ${count > 0 ? 'bg-primary-50 shadow-none ring-[3px] ring-primary-700' : ''}`}
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
                  <button className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-[#ddd] text-xl md:text-2xl font-semibold cursor-pointer bg-[#fafafa] transition-all duration-200 hover:bg-[#f0f0f0] hover:border-[#999] active:scale-95 leading-none" onClick={() => decrease(item.id)} aria-label={`${item.name} 수량 감소`}>−</button>
                  <strong className="flex-1 text-base md:text-lg font-bold text-center">{count}개</strong>
                  <button className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-[#ddd] text-xl md:text-2xl font-semibold cursor-pointer bg-[#fafafa] transition-all duration-200 hover:bg-[#f0f0f0] hover:border-[#999] active:scale-95 leading-none" onClick={() => increase(item.id)} aria-label={`${item.name} 수량 증가`}>+</button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="bg-white rounded-xl p-3.5 md:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] mb-4" aria-label="주문 상세">
          <h2 className="m-0 mb-3 text-base md:text-lg font-bold">주문 상세</h2>
          {orderedItems.length === 0 ? (
            <p className="m-0 text-[#999] text-sm">{checkoutMutation.isPending ? '결제 처리 중...' : '선택한 메뉴가 없습니다.'}</p>
          ) : (
            <ul className="m-0 p-0 list-none">
              {orderedItems.map((item, index) => {
                const count = counts[item.id];
                return (
                  <li key={item.id} className={`flex justify-between items-center py-2.5 text-sm ${index !== orderedItems.length - 1 ? 'border-b border-[#f0f0f0]' : ''}`}>
                    <span>{item.name} × {count}</span>
                    <strong className="font-bold text-primary-700">{formatPrice(item.price * count)}원</strong>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            className="w-full p-4 mt-4 text-lg font-bold bg-primary-700 text-white border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary-800 hover:-translate-y-0.5 disabled:bg-[#ccc] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#ccc] disabled:hover:translate-y-0"
            onClick={handleCheckout}
            disabled={checkoutMutation.isPending || orderedItems.length === 0}
          >
            {checkoutMutation.isPending ? '처리 중...' : '결제하기'}
          </button>
        </section>

                {/* <SalesBanner
          totalRevenue={todaySales.totalRevenue}
          totalOrders={todaySales.totalOrders}
          flashKey={flashKey}
          lastPayment={lastPayment}
        /> */}

        <section className="bg-white rounded-xl p-3.5 md:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]" aria-label="최근 주문">
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
                    <span className="text-[#888] text-xs font-medium">{formatKSTTime(order.created_at)}</span>
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
      </main>
    </>
  );
}
