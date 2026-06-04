'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { fetchMenuItems } from '@/app/actions/menu';
import { formatPrice, hexWithAlpha } from '@/lib/utils';
import type { MenuItem } from '@/types/database';

function fireConfetti() {
  const colors = ['#f43f5e', '#fb7185', '#fda4af', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];
  confetti({ particleCount: 90, spread: 70, origin: { x: 0.5, y: 0.55 }, colors, startVelocity: 42, gravity: 1.1, ticks: 100, scalar: 1.1 });
  setTimeout(() => {
    confetti({ particleCount: 55, spread: 58, origin: { x: 0.18, y: 0.62 }, angle: 65, colors, startVelocity: 36, gravity: 1.1, ticks: 80 });
    confetti({ particleCount: 55, spread: 58, origin: { x: 0.82, y: 0.62 }, angle: 115, colors, startVelocity: 36, gravity: 1.1, ticks: 80 });
  }, 110);
  setTimeout(() => {
    confetti({ particleCount: 35, spread: 100, origin: { x: 0.5, y: 0.48 }, colors, startVelocity: 22, gravity: 0.75, ticks: 70, scalar: 0.85 });
  }, 240);
}

type CartItem = { id: number; name: string; price: number; count: number; color?: string };
type Mode = 'view' | 'order';

const BANNERS = [
  '4개 이상 구매하시면 보냉백에 담아드려요.',
  '현금결제와 상품권 결제는 미리 말씀해주세요.',
  '받은 산도는 냉장보관 해주세요.',
  '모든 산도는 당일 제조 상품이에요.',
  '유제품, 과일 등 알레르기가 있으시면 꼭 말씀해주세요.',
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

type DisplayState = 'idle' | 'checkout' | 'thanks';

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-xl p-1">
      <button
        onClick={() => setMode('view')}
        className={`px-5 py-2 rounded-lg text-base font-bold transition-all duration-200 cursor-pointer border-none ${
          mode === 'view'
            ? 'bg-white text-[#1a1a1a] shadow-sm'
            : 'bg-transparent text-[#999] hover:text-[#555]'
        }`}
      >
        프론트
      </button>
      <button
        onClick={() => setMode('order')}
        className={`px-5 py-2 rounded-lg text-base font-bold transition-all duration-200 cursor-pointer border-none ${
          mode === 'order'
            ? 'bg-white text-[#1a1a1a] shadow-sm'
            : 'bg-transparent text-[#999] hover:text-[#555]'
        }`}
      >
        주문하기
      </button>
    </div>
  );
}

export default function DisplayPage() {
  const [mode, setMode] = useState<Mode>('view');
  const [navExpanded, setNavExpanded] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotalPrice, setCartTotalPrice] = useState(0);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [localCounts, setLocalCounts] = useState<Record<number, number>>({});
  const [bannerIndex, setBannerIndex] = useState(0);
  const [displayState, setDisplayState] = useState<DisplayState>('idle');
  const [checkoutItems, setCheckoutItems] = useState<CartItem[]>([]);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const displayStateRef = useRef<DisplayState>('idle');
  const animTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('display-nav-expanded');
    if (saved !== null) setNavExpanded(saved !== 'false');
  }, []);

  const toggleNav = () => {
    setNavExpanded((v) => {
      localStorage.setItem('display-nav-expanded', String(!v));
      return !v;
    });
  };

  useEffect(() => {
    const id = setInterval(() => setBannerIndex((i) => (i + 1) % BANNERS.length), 3500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => { animTimerRef.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('cart-display')
      .on('broadcast', { event: 'cart_update' }, ({ payload }) => {
        if (displayStateRef.current !== 'idle') return;
        const p = payload as { items: CartItem[]; totalPrice: number };
        setCartItems(p.items ?? []);
        setCartTotalPrice(p.totalPrice ?? 0);
      })
      .on('broadcast', { event: 'cart_reset' }, () => {
        if (displayStateRef.current !== 'idle') return;
        setLocalCounts({});
        setCartItems([]);
        setCartTotalPrice(0);
      })
      .on('broadcast', { event: 'checkout_complete' }, ({ payload }) => {
        const { items, totalPrice: total } = payload as { items: CartItem[]; totalPrice: number };
        animTimerRef.current.forEach(clearTimeout);
        setCheckoutItems(items ?? []);
        setCheckoutTotal(total ?? 0);
        setLocalCounts({});
        setCartItems([]);
        setCartTotalPrice(0);
        setMode('view');
        displayStateRef.current = 'checkout';
        setDisplayState('checkout');
        const t1 = setTimeout(() => {
          displayStateRef.current = 'thanks';
          setDisplayState('thanks');
          const t2 = setTimeout(() => {
            displayStateRef.current = 'idle';
            setDisplayState('idle');
          }, 2500);
          animTimerRef.current = [t2];
        }, 5000);
        animTimerRef.current = [t1];
      });
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'request_sync', payload: {} });
      }
    });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (displayState === 'checkout') fireConfetti();
  }, [displayState]);

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

      {/* 접이식 헤더 */}
      <motion.header
        animate={{ height: navExpanded ? 'auto' : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white border-b border-[#eee] shadow-sm overflow-hidden"
        style={{ minHeight: 0 }}
      >
        <div className="px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            title="홈으로"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </Link>

          <ModeToggle mode={mode} setMode={setMode} />

          {/* 접기 버튼 */}
          <button
            onClick={toggleNav}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-[#eee] hover:text-[#555] transition-all duration-200 border-none cursor-pointer"
            title="헤더 접기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
      </motion.header>

      {/* nav 접혔을 때 상단 중앙 플로팅 토글 */}
      <AnimatePresence>
        {!navExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-2xl p-1.5 shadow-lg border border-[#eee]"
          >
            <ModeToggle mode={mode} setMode={setMode} />
            <button
              onClick={toggleNav}
              className="ml-1 flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-[#eee] hover:text-[#555] transition-all duration-200 border-none cursor-pointer"
              title="헤더 펼치기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 컨텐츠 */}
      <main className="flex-1 flex flex-col overflow-auto relative pb-24">
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
                    <h2 className="text-5xl font-black text-[#1a1a1a] mb-3 m-0">안녕하세요!</h2>
                    <p className="text-[#999] text-2xl m-0">주문을 기다리고 있어요</p>
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
                        <h3 className="text-base font-bold text-[#888] tracking-wide uppercase m-0">주문 내역</h3>
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
                                {item.color && (
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                )}
                                <span className="text-[22px] font-semibold text-[#1a1a1a]">{item.name}</span>
                                <span className="text-base font-bold text-[#bbb]">× {item.count}</span>
                              </div>
                              <span className="text-[22px] font-bold text-[#333]">
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
                      <span className="text-white text-2xl font-bold opacity-80">합계</span>
                      <span className="text-white text-[48px] font-black leading-none">
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
              <div className="flex-1 p-4 flex flex-col items-center justify-center">
                {menuItems.length === 0 ? (
                  <div className="flex items-center justify-center h-48">
                    <p className="text-[#999] text-base m-0">메뉴를 불러오는 중...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
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
                            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <h3 className="m-0 text-lg font-bold text-[#1a1a1a] leading-snug">{item.name}</h3>
                          </div>
                          <p className="m-0 text-xl font-extrabold text-[#333] mb-3">{formatPrice(item.price)}원</p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); decrement(item.id); }}
                              className="w-10 h-10 rounded-lg border border-[#e0e0e0] text-2xl font-semibold bg-[#fafafa] flex items-center justify-center cursor-pointer active:scale-95 transition-transform leading-none"
                              style={{ touchAction: 'manipulation' }}
                            >
                              −
                            </button>
                            <span className={`flex-1 text-center text-xl font-black ${count > 0 ? 'text-primary-700' : 'text-[#ccc]'}`}>
                              {count}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); increment(item.id); }}
                              className="w-10 h-10 rounded-lg border border-[#e0e0e0] text-2xl font-semibold bg-[#fafafa] flex items-center justify-center cursor-pointer active:scale-95 transition-transform leading-none"
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

              {/* 주문 요약 팝업 */}
              <AnimatePresence>
                {localTotalCount > 0 && (
                  <motion.div
                    initial={{ y: 100, opacity: 0, scale: 0.97 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 100, opacity: 0, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className="fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20"
                  >
                    <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-5 border border-[#eee]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="m-0 text-[#888] text-sm font-semibold mb-1">선택한 항목</p>
                        <p className="m-0 text-[#1a1a1a] text-2xl font-black leading-none">
                          {localTotalCount}개 &middot; {formatPrice(localTotalPrice)}원
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={resetLocalOrder}
                      className="w-full py-4 rounded-xl bg-primary-700 text-white text-xl font-black cursor-pointer border-none hover:bg-primary-800 active:scale-95 transition-all"
                    >
                      초기화
                    </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 결제 완료 오버레이 */}
        <AnimatePresence>
          {displayState !== 'idle' && (
            <motion.div
              key={displayState}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 z-20 bg-[#f5f6f7] flex items-center justify-center p-8"
            >
              {displayState === 'checkout' ? (
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full max-w-lg"
                >
                  <motion.div
                    animate={{ boxShadow: ['0 0 0 3px #084431', '0 0 0 7px #08443140', '0 0 0 3px #084431'] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="bg-white rounded-2xl overflow-hidden mb-4"
                  >
                    <div className="bg-primary-700 px-6 py-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
                      <h3 className="text-base font-bold text-white/90 tracking-wide uppercase m-0">결제 완료</h3>
                    </div>
                    <ul className="m-0 p-0 list-none divide-y divide-[#f5f5f5]">
                      {checkoutItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between px-6 py-4">
                          <div className="flex items-center gap-3">
                            {item.color && <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />}
                            <span className="text-[22px] font-semibold text-[#1a1a1a]">{item.name}</span>
                            <span className="text-base font-bold text-[#bbb]">× {item.count}</span>
                          </div>
                          <span className="text-[22px] font-bold text-[#333]">{formatPrice(item.price * item.count)}원</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                  <div className="bg-primary-700 rounded-2xl px-6 py-5 flex items-center justify-between shadow-[0_4px_20px_rgba(8,68,49,0.25)]">
                    <span className="text-white text-2xl font-bold opacity-80">합계</span>
                    <span className="text-white text-[48px] font-black leading-none">{formatPrice(checkoutTotal)}원</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 0.88, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="text-center"
                >
                  <h2 className="text-7xl font-black text-primary-700 mb-3 m-0">감사합니다😺</h2>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 하단 고정 플립 배너 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-10 bg-primary-600 px-6 py-5 flex items-center justify-center overflow-hidden"
        style={{ perspective: '800px' }}
      >
        <AnimatePresence mode="wait">
          <motion.p
            key={bannerIndex}
            variants={bannerVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="m-0 text-white text-lg font-bold tracking-wide text-center"
            style={{ transformOrigin: 'center center', backfaceVisibility: 'hidden' }}
          >
            {BANNERS[bannerIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
