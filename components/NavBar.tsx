'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresence } from '@/hooks/usePresence';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';
const POPUP_AUTH_KEY = 'choichoi_popup_token';
const POPUP_ID_KEY = 'choichoi_popup_id';
const POPUP_NAME_KEY = 'choichoi_popup_name';

const ALL_NAV_LINKS = [
  { href: '/pos', label: 'POS', adminOnly: false },
  { href: '/orders', label: '주문', adminOnly: false },
  { href: '/stats', label: '통계', adminOnly: true },
  { href: '/schedule', label: '일정', adminOnly: true },
  { href: '/inventory', label: '재고', adminOnly: true },
  { href: '/memo', label: '메모', adminOnly: false },
  { href: '/settings', label: '설정', adminOnly: true },
] as const;

function useTodayLabel(): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const d = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    setLabel(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`);
  }, []);
  return label;
}

export default function NavBar({ activeCashiers: activeCashiersProp, cheerTotal }: { activeCashiers?: string[]; cheerTotal?: number } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const todayLabel = useTodayLabel();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [popupName, setPopupName] = useState<string | null>(null);
  const [popupId, setPopupId] = useState('0');

  const ownActiveCashiers = usePresence(activeCashiersProp !== undefined ? null : cashierName);
  const activeCashiers = activeCashiersProp ?? ownActiveCashiers;
  const [floatHeart, setFloatHeart] = useState(0);
  const cheerPrevRef = useRef(cheerTotal ?? 0);

  useEffect(() => {
    if ((cheerTotal ?? 0) > cheerPrevRef.current) setFloatHeart((k) => k + 1);
    cheerPrevRef.current = cheerTotal ?? 0;
  }, [cheerTotal]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
      setPopupName(localStorage.getItem(POPUP_NAME_KEY));
      setPopupId(localStorage.getItem(POPUP_ID_KEY) ?? '0');
    } catch { /* ignore */ }

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => setIsAdmin(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAdmin(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const visibleLinks = useMemo(
    () => ALL_NAV_LINKS.filter((l) => !l.adminOnly || isAdmin),
    [isAdmin]
  );

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleAdminLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    try {
      localStorage.removeItem(CASHIER_NAME_KEY);
      localStorage.removeItem(POPUP_ID_KEY);
      localStorage.removeItem(POPUP_NAME_KEY);
    } catch { /* ignore */ }
    window.location.href = '/pos';
  };

  const handleCashierLogout = () => {
    try {
      localStorage.removeItem(POPUP_AUTH_KEY);
      localStorage.removeItem(CASHIER_NAME_KEY);
      localStorage.removeItem(POPUP_ID_KEY);
      localStorage.removeItem(POPUP_NAME_KEY);
    } catch { /* ignore */ }
    window.location.href = '/';
  };

  return (
    <>
      <div className="mb-4">
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.header
              key="navbar"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden bg-canvas border-b border-hairline shadow-level-1"
            >
              <div className="px-3 md:px-5 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
                {/* 1단: 로고 + 접속자 + 모바일 전용 액션 */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link href="/pos" className="m-0 text-xl md:text-2xl font-extrabold text-ink shrink-0 no-underline hover:opacity-70 transition-opacity">ChoiChoi</Link>
                    {popupName && (
                      <span className="hidden md:inline text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200 shrink-0">
                        {popupName}
                      </span>
                    )}
                    {(activeCashiers.length > 0 || (cheerTotal ?? 0) > 0) && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="hidden md:inline text-[11px] text-ink-faint shrink-0">접속</span>
                        <div className="flex gap-1 flex-wrap">
                          {activeCashiers.map((name) => (
                            <span key={name} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {name}
                            </span>
                          ))}
                        </div>
                        {(cheerTotal ?? 0) > 0 && (
                          <span className="relative inline-flex items-center shrink-0">
                            <motion.span
                              key={cheerTotal}
                              initial={{ scale: 1.7 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                              className="text-[11px] font-bold text-rose-400 inline-block"
                            >
                              ❤️ {cheerTotal}
                            </motion.span>
                            <AnimatePresence>
                              {floatHeart > 0 && (
                                <motion.span
                                  key={floatHeart}
                                  initial={{ y: 0, opacity: 1, scale: 1 }}
                                  animate={{ y: -18, opacity: 0, scale: 0.6 }}
                                  transition={{ duration: 0.55, ease: 'easeOut' }}
                                  onAnimationComplete={() => setFloatHeart(0)}
                                  className="absolute text-[10px] pointer-events-none left-1/2 -translate-x-1/2"
                                >
                                  ❤️
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 모바일 전용 우측 액션 */}
                  <div className="flex md:hidden items-center gap-1.5 shrink-0">
                    {isAdmin ? (
                      <button
                        onClick={handleAdminLogout}
                        title="관리자 로그아웃"
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={handleCashierLogout}
                        title="로그아웃"
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2단: 네비게이션 + 데스크탑 전용 액션 */}
                <div className="flex items-center justify-between md:justify-end gap-2 min-w-0">
                  <nav className="min-w-0 flex-1 md:flex-initial">
                    <ul className="flex gap-1.5 md:gap-2 m-0 p-0 list-none flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {visibleLinks.map(({ href, label }) => (
                        <li key={href}>
                          <Link
                            href={href}
                            className={`block px-3 py-1.5 md:px-4 md:py-2 text-[13px] md:text-sm rounded-lg no-underline font-semibold transition-all duration-200 whitespace-nowrap ${
                              pathname === href
                                ? 'bg-primary-700 text-white'
                                : 'bg-canvas-soft text-ink hover:bg-primary-700 hover:text-white'
                            }`}
                          >
                            {label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>

                  {/* 데스크탑 전용 우측 액션 */}
                  <div className="hidden md:flex items-center gap-2">
                    <div className="w-px h-5 bg-hairline shrink-0" />
                    {isAdmin ? (
                      <button
                        onClick={handleAdminLogout}
                        title="관리자 로그아웃"
                        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={handleCashierLogout}
                        title="로그아웃"
                        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.header>
          )}
        </AnimatePresence>

        <div className="flex justify-center pt-1 cursor-pointer">
          <button
            onClick={toggle}
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            className="flex items-center justify-center w-9 h-4 rounded-full bg-hairline hover:bg-[#d0d0d0] transition-colors group cursor-pointer"
          >
            <motion.svg
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              width="12"
              height="6"
              viewBox="0 0 12 6"
              fill="none"
              className="text-ink-faint group-hover:text-ink-muted transition-colors"
            >
              <path d="M1 5L6 1L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </button>
        </div>
      </div>

    </>
  );
}
