'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresence } from '@/hooks/usePresence';

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';
const POPUP_AUTH_KEY = 'choichoi_popup_token';
const POPUP_ID_KEY = 'choichoi_popup_id';
const POPUP_NAME_KEY = 'choichoi_popup_name';

const ALL_NAV_LINKS = [
  { href: '/pos', label: 'POS' },
  { href: '/orders', label: '주문' },
  { href: '/stats', label: '통계' },
  { href: '/schedule', label: '일정' },
  { href: '/inventory', label: '재고' },
  { href: '/memo', label: '메모' },
  { href: '/settings', label: '설정' },
] as const;


export default function NavBar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [popupName, setPopupName] = useState<string | null>(null);

  const activeCashiers = usePresence(cashierName);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
      setPopupName(localStorage.getItem(POPUP_NAME_KEY));
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
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
              className="overflow-hidden bg-white border-b border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <div className="px-3 md:px-5 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
                {/* 1단: 로고 + 접속자 + 모바일 전용 액션 */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="m-0 text-xl md:text-2xl font-extrabold text-[#161616] shrink-0">ChoiChoi</h1>
                    {popupName && (
                      <span className="hidden md:inline text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200 shrink-0">
                        {popupName}
                      </span>
                    )}
                    {activeCashiers.length > 0 && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="hidden md:inline text-[11px] text-[#bbb] shrink-0">접속</span>
                        <div className="flex gap-1 flex-wrap">
                          {activeCashiers.map((name) => (
                            <span key={name} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 모바일 전용 우측 액션 */}
                  <div className="flex md:hidden items-center gap-1.5 shrink-0">
                    <button
                      onClick={handleCashierLogout}
                      title="처음으로"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 2단: 네비게이션 + 데스크탑 전용 액션 */}
                <div className="flex items-center justify-between md:justify-end gap-2 min-w-0">
                  <nav className="min-w-0 flex-1 md:flex-initial">
                    <ul className="flex gap-1.5 md:gap-2 m-0 p-0 list-none flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {ALL_NAV_LINKS.map(({ href, label }) => (
                        <li key={href}>
                          <Link
                            href={href}
                            className={`block px-3 py-1.5 md:px-4 md:py-2 text-[13px] md:text-sm rounded-lg no-underline font-semibold transition-all duration-200 whitespace-nowrap ${
                              pathname === href
                                ? 'bg-primary-700 text-white'
                                : 'bg-[#f5f6f7] text-[#161616] hover:bg-primary-700 hover:text-white'
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
                    <div className="w-px h-5 bg-[#e5e5e5] shrink-0" />
                    <button
                      onClick={handleCashierLogout}
                      title="처음으로"
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
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
            className="flex items-center justify-center w-9 h-4 rounded-full bg-[#e8e8e8] hover:bg-[#d8d8d8] transition-colors group cursor-pointer"
          >
            <motion.svg
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              width="12"
              height="6"
              viewBox="0 0 12 6"
              fill="none"
              className="text-[#aaa] group-hover:text-[#888] transition-colors"
            >
              <path d="M1 5L6 1L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          </button>
        </div>
      </div>
    </>
  );
}
