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
  const [popupName, setPopupName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeCashiers = usePresence(cashierName);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setIsAdmin(!!localStorage.getItem(ADMIN_AUTH_KEY));
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
      setPopupName(localStorage.getItem(POPUP_NAME_KEY));
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

  const handleCashierLogout = () => {
    try {
      localStorage.removeItem(POPUP_AUTH_KEY);
      localStorage.removeItem(CASHIER_NAME_KEY);
      localStorage.removeItem(ADMIN_AUTH_KEY);
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
                    {isAdmin ? (
                      <button
                        onClick={handleLogout}
                        title="관리자 로그아웃"
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={openModal}
                          className="px-3 py-1.5 text-[13px] rounded-lg font-semibold whitespace-nowrap bg-[#f5f6f7] text-[#999] hover:bg-primary-700 hover:text-white border-none cursor-pointer transition-all duration-200"
                        >
                          관리자
                        </button>
                        <button
                          onClick={handleCashierLogout}
                          title="로그아웃"
                          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                          </svg>
                        </button>
                      </>
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
                    {isAdmin ? (
                      <button
                        onClick={handleLogout}
                        title="관리자 로그아웃"
                        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                          <polyline points="16 17 21 12 16 7"/>
                          <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={openModal}
                          className="shrink-0 px-3 py-1.5 md:px-4 md:py-2 text-[13px] md:text-sm rounded-lg font-semibold transition-all duration-200 whitespace-nowrap bg-[#f5f6f7] text-[#999] hover:bg-primary-700 hover:text-white border-none cursor-pointer"
                        >
                          관리자
                        </button>
                        <button
                          onClick={handleCashierLogout}
                          title="로그아웃"
                          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-[#f5f6f7] text-[#999] hover:bg-rose-50 hover:text-rose-500 border-none cursor-pointer transition-all duration-200"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                          </svg>
                        </button>
                      </>
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
