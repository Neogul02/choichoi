'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresence } from '@/hooks/usePresence';

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const ADMIN_AUTH_KEY = 'choichoi_admin_token';
const ADMIN_AUTH_API_PATH = '/api/auth/admin';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';

const ALL_NAV_LINKS = [
  { href: '/', label: 'POS', adminOnly: false },
  { href: '/orders', label: '주문', adminOnly: false },
  { href: '/stats', label: '통계', adminOnly: true },
  { href: '/schedule', label: '일정', adminOnly: true },
  { href: '/memo', label: '메모', adminOnly: false },
  { href: '/settings', label: '설정', adminOnly: true },
] as const;

type ModalState =
  | { open: false }
  | { open: true; password: string; error: string; submitting: boolean };

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
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [cashierName, setCashierName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeCashiers = usePresence(cashierName);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setIsAdmin(!!localStorage.getItem(ADMIN_AUTH_KEY));
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (modal.open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [modal.open]);

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

  const openModal = () => setModal({ open: true, password: '', error: '', submitting: false });
  const closeModal = () => setModal({ open: false });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal.open) return;
    if (!modal.password) { setModal({ ...modal, error: '비밀번호를 입력해주세요.' }); return; }
    setModal({ ...modal, submitting: true, error: '' });
    try {
      const res = await fetch(ADMIN_AUTH_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: modal.password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setModal({ ...modal, submitting: false, error: data.message || '비밀번호가 올바르지 않습니다.' });
        return;
      }
      localStorage.setItem(ADMIN_AUTH_KEY, data.token);
      setIsAdmin(true);
      closeModal();
    } catch {
      setModal({ ...modal, submitting: false, error: '오류가 발생했습니다. 다시 시도해주세요.' });
    }
  };

  const handleLogout = () => {
    try { localStorage.removeItem(ADMIN_AUTH_KEY); } catch { /* ignore */ }
    setIsAdmin(false);
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
              <div className="px-3 md:px-5 py-2.5 flex flex-col md:flex-row justify-between md:items-center gap-2 md:gap-0">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="m-0 text-xl md:text-2xl font-extrabold text-[#161616] shrink-0">ChoiChoi</h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeCashiers.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#bbb] shrink-0">접속</span>
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
                </div>
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
                      <li>
                        {isAdmin ? (
                          <button
                            onClick={handleLogout}
                            className="block px-3 py-1.5 md:px-4 md:py-2 text-[13px] md:text-sm rounded-lg font-semibold transition-all duration-200 whitespace-nowrap bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer"
                          >
                            로그아웃
                          </button>
                        ) : (
                          <button
                            onClick={openModal}
                            className="block px-3 py-1.5 md:px-4 md:py-2 text-[13px] md:text-sm rounded-lg font-semibold transition-all duration-200 whitespace-nowrap bg-[#f5f6f7] text-[#999] hover:bg-primary-700 hover:text-white border-none cursor-pointer"
                          >
                            관리자
                          </button>
                        )}
                      </li>
                    </ul>
                  </nav>
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

      <AnimatePresence>
        {modal.open && (
          <motion.div
            key="admin-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-2xl p-5 shadow-[0_8px_40px_rgba(0,0,0,0.18)] w-full max-w-[320px]"
            >
              <h2 className="m-0 mb-1 text-lg font-black text-[#161616]">관리자 로그인</h2>
              <p className="m-0 mb-4 text-[13px] text-[#999]">관리자 비밀번호를 입력해주세요.</p>
              <form onSubmit={handleLogin}>
                <input
                  ref={inputRef}
                  type="password"
                  value={modal.password}
                  onChange={(e) => setModal({ ...modal, password: e.target.value })}
                  placeholder="비밀번호"
                  className="w-full border border-[#ddd] rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 mb-3"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
                {modal.error && <p className="m-0 mb-3 text-[13px] text-rose-500">{modal.error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-lg border border-[#ddd] bg-white text-[13px] font-semibold text-[#666] cursor-pointer hover:bg-[#f5f5f5] transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={modal.submitting}
                    className="flex-1 py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {modal.submitting ? '확인 중...' : '로그인'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
