'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { fetchMenuItems } from '@/app/actions';
import { formatPrice, hexWithAlpha } from '@/lib/utils';
import type { MenuItem } from '@/types/database';

type CartItem = { id: number; name: string; price: number; count: number; color?: string };
type Mode = 'view' | 'order';

const BANNERS = [
  '테스트 텍스트 1',
  '테스트 텍스트 2',
  '테스트 텍스트 3',
  '테스트 텍스트 4',
  '테스트 텍스트 5',
];

const bannerVariants: Variants = {
  enter: { rotateX: -90, opacity: 0 },
  center: { rotateX: 0, opacity: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit: { rotateX: 90, opacity: 0, transition: { duration: 0.25, ease: 'easeIn' } },
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.18 } },
};

export default function DisplayPage() {
  const [mode, setMode] = useState<Mode>('view');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotalPrice, setCartTotalPrice] = useState(0);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [localCounts, setLocalCounts] = useState<Record<number, number>>({});
  const [bannerIndex, setBannerIndex] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setBannerIndex((i) => (i + 1) % BANNERS.length), 3500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('cart-display')
      .on('broadcast', { event: 'cart_update' }, ({ payload }) => {
        const p = payload as { items: CartItem[]; totalPrice: number };
        setCartItems(p.items ?? []);
        setCartTotalPrice(p.totalPrice ?? 0);
      });
    ch.subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (mode === 'order' && menuItems.length === 0) {
      fetchMenuItems().then((result) => {
        if (result.success) setMenuItems(result.data ?? []);
      });
    }
  }, [mode, menuItems.length]);

  const sendUpdate = (itemId: number, delta: number) => {
    channelRef.current?.send({ type: 'broadcast', event: 'customer_update', payload: { itemId, delta } });
  };

  const increment = (itemId: number) => {
    setLocalCounts((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
    sendUpdate(itemId, 1);
  };

  const decrement = (itemId: number) => {
    const current = localCounts[itemId] ?? 0;
    if (current <= 0) return;
    setLocalCounts((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) - 1) }));
    sendUpdate(itemId, -1);
  };

  const resetLocalOrder = () => {
    const ch = channelRef.current;
    if (ch) {
      Object.entries(localCounts).forEach(([id, count]) => {
        if (count > 0) ch.send({ type: 'broadcast', event: 'customer_update', payload: { itemId: Number(id), delta: -count } });
      });
    }
    setLocalCounts({});
  };

  const localTotalPrice = menuItems.reduce((sum, item) => sum + item.price * (localCounts[item.id] ?? 0), 0);
  const localTotalCount = Object.values(localCounts).reduce((sum, c) => sum + c, 0);
  const isEmpty = cartItems.length === 0;

  return (
    <div className="min-h-screen bg-[#f5f6f7] flex flex-col select-none">
      {/* 플립 배너 */}
      <div
        className="bg-primary-700 px-6 py-2.5 flex items-center justify-center overflow-hidden"
        style={{ perspective: '800px' }}
      >
        <AnimatePresence mode="wait">
          <motion.p
            key={bannerIndex}
            variants={bannerVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="m-0 text-white text-sm font-semibold tracking-wide text-center"
            style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
          >
            {BANNERS[bannerIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* 헤더 + 토글 */}
      <header className="bg-white border-b border-[#eee] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {/* <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center">
            <span className="text-white text-[11px] font-black">CC</span>
          </div> */}
          {/* <span className="text-xl font-black text-[#1a1a1a] tracking-tight">CHOICHOI</span> */}
        </div>
        <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-xl p-1">
          <button
            onClick={() => setMode('view')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer border-none ${
              mode === 'view'
                ? 'bg-white text-[#1a1a1a] shadow-sm'
                : 'bg-transparent text-[#999] hover:text-[#555]'
            }`}
          >
            보기
          </button>
          <button
            onClick={() => setMode('order')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-200 cursor-pointer border-none ${
              mode === 'order'
                ? 'bg-white text-[#1a1a1a] shadow-sm'
                : 'bg-transparent text-[#999] hover:text-[#555]'
            }`}
          >
            주문
          </button>
        </div>
      </header>

      {/* 컨텐츠 */}
      <main className="flex-1 flex flex-col overflow-auto">
        <AnimatePresence mode="wait">
          {mode === 'view' ? (
            /* ── 보기 모드 ── */
            <motion.div
              key="view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col items-center justify-center p-8"
            >
              <AnimatePresence mode="wait">
                {isEmpty ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.25 }}
                    className="text-center"
                  >
                    <h2 className="text-3xl font-black text-[#1a1a1a] mb-2 m-0">환영합니다</h2>
                    <p className="text-[#999] text-lg m-0">주문을 기다리고 있어요</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="cart"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-lg"
                  >
                    <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.07)] overflow-hidden mb-4">
                      <div className="px-6 py-4 border-b border-[#f0f0f0]">
                        <h3 className="text-sm font-bold text-[#888] tracking-wide uppercase m-0">주문 내역</h3>
                      </div>
                      <ul className="m-0 p-0 list-none divide-y divide-[#f5f5f5]">
                        <AnimatePresence initial={false}>
                          {cartItems.map((item) => (
                            <motion.li
                              key={item.id}
                              variants={listItemVariants}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              className="flex items-center justify-between px-6 py-4"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="w-7 h-7 rounded-full text-sm font-black flex items-center justify-center shrink-0"
                                  style={item.color ? {
                                    backgroundColor: hexWithAlpha(item.color, 0.15),
                                    color: item.color,
                                  } : { backgroundColor: '#f0f0f0', color: '#555' }}
                                >
                                  {item.count}
                                </span>
                                {item.color && (
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                )}
                                <span className="text-[17px] font-semibold text-[#1a1a1a]">{item.name}</span>
                              </div>
                              <span className="text-[17px] font-bold text-[#333]">
                                {formatPrice(item.price * item.count)}원
                              </span>
                            </motion.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </div>

                    <motion.div
                      key={cartTotalPrice}
                      initial={{ scale: 1.03 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                      className="bg-primary-700 rounded-2xl px-6 py-5 flex items-center justify-between shadow-[0_4px_20px_rgba(8,68,49,0.25)]"
                    >
                      <span className="text-white text-lg font-bold opacity-80">합계</span>
                      <span className="text-white text-[32px] font-black leading-none">
                        {formatPrice(cartTotalPrice)}원
                      </span>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            /* ── 주문 모드 ── */
            <motion.div
              key="order"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 p-4 pb-0">
                {menuItems.length === 0 ? (
                  <div className="flex items-center justify-center h-48">
                    <p className="text-[#999] text-sm m-0">메뉴를 불러오는 중...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-w-2xl mx-auto">
                    {menuItems.map((item) => {
                      const count = localCounts[item.id] ?? 0;
                      return (
                        <motion.div
                          key={item.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => increment(item.id)}
                          className="rounded-xl p-4 cursor-pointer transition-all duration-200"
                          style={count > 0 ? {
                            backgroundColor: hexWithAlpha(item.color, 0.15),
                            boxShadow: `0 0 0 2.5px ${hexWithAlpha(item.color, 0.55)}`,
                          } : { backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <h3 className="m-0 text-sm font-bold text-[#1a1a1a] leading-snug">{item.name}</h3>
                          </div>
                          <p className="m-0 text-base font-extrabold text-[#333] mb-3">{formatPrice(item.price)}원</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); decrement(item.id); }}
                              className="w-9 h-9 rounded-lg border border-[#e0e0e0] text-xl font-semibold bg-[#fafafa] flex items-center justify-center cursor-pointer active:scale-95 transition-transform leading-none"
                              style={{ touchAction: 'manipulation' }}
                            >
                              −
                            </button>
                            <span className={`flex-1 text-center text-base font-black ${count > 0 ? 'text-primary-700' : 'text-[#ccc]'}`}>
                              {count}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); increment(item.id); }}
                              className="w-9 h-9 rounded-lg border border-[#e0e0e0] text-xl font-semibold bg-[#fafafa] flex items-center justify-center cursor-pointer active:scale-95 transition-transform leading-none"
                              style={{ touchAction: 'manipulation' }}
                            >
                              +
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 주문 요약 바 */}
              <AnimatePresence>
                {localTotalCount > 0 && (
                  <motion.div
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className="sticky bottom-0 bg-primary-700 px-6 py-4 flex items-center justify-between shadow-[0_-4px_24px_rgba(8,68,49,0.2)] mt-4"
                  >
                    <div>
                      <p className="m-0 text-white/65 text-xs font-semibold mb-0.5">선택한 항목</p>
                      <p className="m-0 text-white text-lg font-black leading-none">
                        {localTotalCount}개 · {formatPrice(localTotalPrice)}원
                      </p>
                    </div>
                    <button
                      onClick={resetLocalOrder}
                      className="px-4 py-2 rounded-lg bg-white/15 text-white text-sm font-bold cursor-pointer border-none hover:bg-white/25 active:scale-95 transition-all"
                    >
                      초기화
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
