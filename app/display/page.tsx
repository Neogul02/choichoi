'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '@/lib/supabase';
import { fetchMenuItems } from '@/app/actions/menu';
import { fetchActivePopupEvents } from '@/app/actions/schedule';
import type { MenuItem, PopupEvent } from '@/types/database';
import type { CartItem, Mode, DisplayState } from '@/types/display';
import ViewMode from '@/components/display/ViewMode';
import OrderMode from '@/components/display/OrderMode';
import ScreenMode from '@/components/display/ScreenMode';
import CheckoutOverlay from '@/components/display/CheckoutOverlay';
import BottomBanner from '@/components/display/BottomBanner';

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


function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-xl p-1 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        onClick={() => setMode('view')}
        className={`shrink-0 whitespace-nowrap px-5 py-2 rounded-lg text-base font-bold transition-all duration-200 cursor-pointer border-none ${
          mode === 'view' ? 'bg-white text-ink shadow-sm' : 'bg-transparent text-ink-faint hover:text-[#555]'
        }`}
      >
        프론트
      </button>
      <button
        onClick={() => setMode('order')}
        className={`shrink-0 whitespace-nowrap px-5 py-2 rounded-lg text-base font-bold transition-all duration-200 cursor-pointer border-none ${
          mode === 'order' ? 'bg-white text-ink shadow-sm' : 'bg-transparent text-ink-faint hover:text-[#555]'
        }`}
      >
        주문하기
      </button>
      <button
        onClick={() => setMode('screen')}
        className={`shrink-0 whitespace-nowrap px-5 py-2 rounded-lg text-base font-bold transition-all duration-200 cursor-pointer border-none ${
          mode === 'screen' ? 'bg-white text-ink shadow-sm' : 'bg-transparent text-ink-faint hover:text-[#555]'
        }`}
      >
        스크린
      </button>
    </div>
  );
}

function PopupSelectScreen() {
  const router = useRouter();
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivePopupEvents().then((result) => {
      if (result.success && result.data) setPopupEvents(result.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-canvas-soft flex flex-col items-center justify-center p-8">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-black text-ink m-0 mb-2">CHOICHOI</h1>
        <p className="text-ink-faint text-base m-0">고객 화면을 연결할 팝업을 선택해주세요</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {loading && (
          <div className="text-center text-ink-faint text-sm py-8">불러오는 중...</div>
        )}
        {!loading && popupEvents.length === 0 && (
          <div className="text-center text-ink-faint text-sm py-8">등록된 팝업이 없습니다</div>
        )}
        {popupEvents.map((popup) => (
          <button
            key={popup.id}
            onClick={() => router.push(`/display?popup=${popup.id}`)}
            className="w-full bg-white text-ink text-left px-6 py-5 rounded-2xl border-none shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.13)] active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            <div className="text-lg font-black mb-0.5">{popup.name}</div>
            <div className="text-sm text-ink-faint">{popup.start_date} ~ {popup.end_date}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// 실제 고객 디스플레이 — popupId를 prop으로 받아 훅을 항상 동일한 순서로 호출
function DisplayContent({ popupId }: { popupId: string }) {
  const [mode, setMode] = useState<Mode>('view');
  const [navExpanded, setNavExpanded] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartTotalPrice, setCartTotalPrice] = useState(0);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [localCounts, setLocalCounts] = useState<Record<number, number>>({});
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
    return () => { animTimerRef.current.forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel(`cart-display-${popupId}`)
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
      if (status === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'request_sync', payload: {} });
    });
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [popupId]);

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
    if ((localCounts[itemId] ?? 0) <= 0) return;
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

  return (
    <div className="min-h-screen bg-canvas-soft flex flex-col select-none">
      <motion.header
        animate={{ height: navExpanded ? 'auto' : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white border-b border-hairline shadow-sm overflow-hidden"
        style={{ minHeight: 0 }}
      >
        <div className="px-6 py-4 grid grid-cols-3 items-center">
          <Link
            href="/"
            title="홈으로"
            className="justify-self-start flex items-center justify-center w-9 h-9 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </Link>
          <div className="justify-self-center flex items-center gap-1 min-w-0 max-w-full">
            <ModeToggle mode={mode} setMode={setMode} />
            <button
              onClick={toggleNav}
              className="ml-1 flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-hairline hover:text-[#555] transition-all duration-200 border-none cursor-pointer"
              title="헤더 접기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
          </div>
          <div />
        </div>
      </motion.header>

      <AnimatePresence>
        {!navExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-2xl p-1.5 shadow-lg border border-hairline max-w-[calc(100vw-2rem)]"
          >
            <ModeToggle mode={mode} setMode={setMode} />
            <button
              onClick={toggleNav}
              className="ml-1 flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-hairline hover:text-[#555] transition-all duration-200 border-none cursor-pointer"
              title="헤더 펼치기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col overflow-auto relative pb-24">
        <AnimatePresence mode="wait">
          {mode === 'view' ? (
            <ViewMode cartItems={cartItems} cartTotalPrice={cartTotalPrice} />
          ) : mode === 'order' ? (
            <OrderMode
              menuItems={menuItems}
              localCounts={localCounts}
              onIncrement={increment}
              onDecrement={decrement}
              onReset={resetLocalOrder}
            />
          ) : (
            <ScreenMode />
          )}
        </AnimatePresence>

        <CheckoutOverlay
          displayState={displayState}
          checkoutItems={checkoutItems}
          checkoutTotal={checkoutTotal}
        />
      </main>

      {mode !== 'screen' && <BottomBanner />}
    </div>
  );
}

// searchParams를 읽어 PopupSelectScreen 또는 DisplayContent로 라우팅
function DisplayRouter() {
  const searchParams = useSearchParams();
  const popupId = searchParams.get('popup') ?? '0';

  if (popupId === '0') return <PopupSelectScreen />;
  return <DisplayContent popupId={popupId} />;
}

export default function DisplayPage() {
  return (
    <Suspense>
      <DisplayRouter />
    </Suspense>
  );
}
