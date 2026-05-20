'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const ADMIN_AUTH_KEY = 'choichoi_admin_token';
const ADMIN_AUTH_API_PATH = '/api/auth/admin';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';

const ALL_NAV_LINKS = [
  { href: '/pos', label: 'POS', adminOnly: false },
  { href: '/orders', label: '주문', adminOnly: false },
  { href: '/stats', label: '통계', adminOnly: true },
  { href: '/schedule', label: '일정', adminOnly: true },
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

export default function NavBar() {
  const pathname = usePathname();
  const todayLabel = useTodayLabel();
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [activeCashiers, setActiveCashiers] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const clientIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setIsAdmin(!!localStorage.getItem(ADMIN_AUTH_KEY));
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!cashierName) return () => {};
    if (!clientIdRef.current) {
      clientIdRef.current = Math.random().toString(36).slice(2, 10);
    }
    const clientId = clientIdRef.current;
    const channel = supabase.channel('pos-presence', {
      config: { presence: { key: clientId } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = [...new Set(Object.values(state).flat().map((p) => p.name))];
        setActiveCashiers(names);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ name: cashierName });
      });
    return () => { supabase.removeChannel(channel); };
  }, [cashierName]);

  useEffect(() => {
    if (showModal) setTimeout(() => inputRef.current?.focus(), 80);
  }, [showModal]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const openModal = () => { setPassword(''); setLoginError(''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setPassword(''); setLoginError(''); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setLoginError('비밀번호를 입력해주세요.'); return; }
    setIsSubmitting(true);
    setLoginError('');
    try {
      const res = await fetch(ADMIN_AUTH_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLoginError(data.message || '비밀번호가 올바르지 않습니다.');
        return;
      }
      localStorage.setItem(ADMIN_AUTH_KEY, data.token);
      setIsAdmin(true);
      closeModal();
    } catch {
      setLoginError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    try { localStorage.removeItem(ADMIN_AUTH_KEY); } catch { /* ignore */ }
    setIsAdmin(false);
  };

  const visibleLinks = ALL_NAV_LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <>
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
                <div className="flex items-center justify-between gap-3">
                  <h1 className="m-0 text-xl md:text-2xl font-extrabold text-[#161616] shrink-0">ChoiChoi</h1>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* {todayLabel && (
                      <span className="text-[11px] font-semibold text-[#bbb] whitespace-nowrap">
                        {todayLabel}
                      </span>
                    )} */}
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

      {/* 관리자 로그인 모달 */}
      <AnimatePresence>
        {showModal && (
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  className="w-full border border-[#ddd] rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 mb-3"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
                {loginError && <p className="m-0 mb-3 text-[13px] text-rose-500">{loginError}</p>}
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
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 rounded-lg border-none bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '확인 중...' : '로그인'}
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
