'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresence, type PresenceUser } from '@/hooks/usePresence';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';
const POPUP_ID_KEY = 'choichoi_popup_id';
const POPUP_NAME_KEY = 'choichoi_popup_name';

const ALL_NAV_LINKS = [
  { href: '/pos', label: 'POS', adminOnly: false },
  { href: '/orders', label: '주문', adminOnly: false },
  { href: '/stats', label: '통계', adminOnly: true },
  { href: '/schedule', label: '일정', adminOnly: true },
  { href: '/inventory', label: '재고', adminOnly: true },
  { href: '/memo', label: '메모', adminOnly: false },
  { href: '/my', label: 'MY', adminOnly: false },
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

export default function NavBar({ activeCashiers: activeCashiersProp }: { activeCashiers?: PresenceUser[] } = {}) {
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

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
      setPopupName(localStorage.getItem(POPUP_NAME_KEY));
      setPopupId(localStorage.getItem(POPUP_ID_KEY) ?? '0');
    } catch { /* ignore */ }

    const supabase = createSupabaseBrowserClient();

    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const role = user?.user_metadata?.role
      setIsAdmin(role === 'admin')
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('name')
          .eq('id', user.id)
          .maybeSingle()
        const displayName = profile?.name
          ?? user.user_metadata?.name
          ?? user.email?.split('@')[0]
          ?? null
        if (displayName) {
          try { localStorage.setItem('choichoi_cashier_name', displayName) } catch { /* ignore */ }
          setCashierName(displayName)
        }
      }
    }
    loadProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const role = session?.user?.user_metadata?.role
      setIsAdmin(role === 'admin')
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

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    try {
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
                    {activeCashiers.length > 0 && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="hidden md:inline text-[11px] text-ink-faint shrink-0">접속</span>
                        <div className="flex gap-1 flex-wrap">
                          {activeCashiers.map((u) => (
                              <span
                                key={u.name}
                                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                                style={{
                                  backgroundColor: 'rgb(240 253 244)',
                                  borderColor: 'rgb(187 247 208)',
                                  color: 'rgb(21 128 61)',
                                }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-[#22c55e]" />
                                {u.name}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 모바일 전용 우측 액션 */}
                  <div className="flex md:hidden items-center gap-1.5 shrink-0">
                    <button
                      onClick={handleLogout}
                      title="로그아웃"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                    </button>
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
                    <button
                      onClick={handleLogout}
                      title="로그아웃"
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                    </button>
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
