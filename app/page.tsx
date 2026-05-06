'use client';

import NavBar from '@/components/NavBar';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchMenuItems, saveOrder } from './actions';
import type { MenuItem } from '@/types/database';
import type { OrderItemInput } from '@/lib/supabase';
import type { SaveOrderResponse } from '@/types/api';
import { formatPrice, getShortcutBadgeColors } from '@/lib/utils';

export default function Home() {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const checkoutFnRef = useRef<(() => Promise<void>) | null>(null);
  const checkoutDebouncingRef = useRef(false);

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

  const checkoutMutation = useMutation<SaveOrderResponse, Error, { items: OrderItemInput[]; totalPrice: number }>({
    mutationFn: ({ items, totalPrice }) => saveOrder(items, totalPrice),
    onSuccess: (result) => {
      if (result.success) {
        setMessage(`주문 완료! 주문번호: ${result.orderId}`);
        resetOrder();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`오류 발생: ${result.error}`);
      }
    },
    onError: (error) => setMessage(`오류 발생: ${error.message}`),
  });

  const handleCheckout = async () => {
    if (totalPrice === 0) { setMessage('주문하신 항목이 없습니다'); return; }

    setIsLoading(true);
    setMessage('');

    try {
      const items = menuItems
        .filter((item) => counts[item.id] > 0)
        .map((item) => ({ id: item.id, name: item.name, price: item.price, count: counts[item.id] }));
      await checkoutMutation.mutateAsync({ items, totalPrice });
    } catch (error) {
      setMessage(`오류 발생: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkoutFnRef.current = handleCheckout;
  });

  return (
    <>
      <NavBar />

      <main className="min-h-screen p-3 md:p-5 max-w-[1100px] mx-auto">
        <header className="bg-white rounded-2xl p-4 md:p-5 mb-3 md:mb-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col md:flex-row gap-2.5 md:gap-4 mb-3">
            <div className="flex-1 rounded-xl p-3.5 md:p-4 bg-[#fff5f5] border-2 border-rose-500">
              <span className="inline-block text-[11px] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full mb-1 bg-rose-500 text-white">결제 대기</span>
              <div className="text-sm md:text-base font-semibold text-[#555] mt-0.5">{totalCount}개</div>
              <div className="text-[clamp(28px,8vw,44px)] md:text-[clamp(32px,5vw,56px)] font-black text-rose-500 leading-[1.1] my-1">{formatPrice(totalPrice)}원</div>
            </div>
          </div>
          <p className="mt-1.5 md:mt-1.5 text-[#666] text-[13px] md:text-sm">
            숫자키 1~9: 메뉴 추가&nbsp;&nbsp;|&nbsp;&nbsp;Enter: 결제&nbsp;&nbsp;|&nbsp;&nbsp;Esc: 초기화
          </p>
          <button
            className="mt-3 border-none rounded-lg px-4 py-2.5 text-sm font-bold bg-primary-700 text-white cursor-pointer transition-all duration-200 hover:bg-primary-800 hover:-translate-y-px active:translate-y-0"
            onClick={resetOrder}
          >
            주문 초기화
          </button>
        </header>

        {message && (
          <div className={`p-3 mb-4 rounded-lg text-center font-semibold ${message.includes('오류') ? 'bg-[#f8d7da] text-[#721c24] border border-[#f5c6cb]' : 'bg-[#d4edda] text-[#155724] border border-[#c3e6cb]'}`}>
            {message}
          </div>
        )}

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
            <p className="m-0 text-[#999] text-sm">선택한 메뉴가 없습니다.</p>
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
            disabled={orderedItems.length === 0 || isLoading}
          >
            {isLoading ? '처리 중...' : '결제하기'}
          </button>
        </section>
      </main>
    </>
  );
}
