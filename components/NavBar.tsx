'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const ADMIN_AUTH_KEY = 'choichoi_admin_token';

const ALL_NAV_LINKS = [
  { href: '/', label: 'POS', adminOnly: false },
  { href: '/stats', label: '통계', adminOnly: true },
  { href: '/schedule', label: '일정', adminOnly: true },
  { href: '/memo', label: '메모', adminOnly: true },
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

export default function NavBar() {
  const pathname = usePathname();
  const todayLabel = useTodayLabel();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setIsAdmin(!!localStorage.getItem(ADMIN_AUTH_KEY));
    } catch { /* ignore */ }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const visibleLinks = ALL_NAV_LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <div className="mb-4">
      {/* 접히는 NavBar */}
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
            <div className="px-3 md:px-5 py-2.5 flex flex-col md:flex-row justify-between md:items-center gap-2 md:gap-0">
              <h1 className="m-0 text-xl md:text-2xl font-extrabold text-[#161616]">ChoiChoi</h1>
              <div className="flex items-center gap-3 md:gap-4">
                <nav>
                  <ul className="flex gap-2 md:gap-3 m-0 p-0 list-none flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {visibleLinks.map(({ href, label }) => (
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
                {todayLabel && (
                  <span className="hidden md:block text-[11px] font-semibold text-[#bbb] whitespace-nowrap border-l border-[#eee] pl-4">
                    {todayLabel}
                  </span>
                )}
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* 항상 보이는 토글 핸들 */}
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
            className="text-[#aaa] group-hover:text-[#888] transition-colors "
          >
            <path d="M1 5L6 1L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </button>
      </div>
    </div>
  );
}
