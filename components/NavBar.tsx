'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresence, type PresenceUser } from '@/hooks/usePresence';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { withTimeout } from '@/lib/utils';
import type { UserAppRole } from '@/types/database';

function toAppRole(value: unknown): UserAppRole {
  return value === 'admin' ? 'admin' : value === 'manager' ? 'manager' : 'user';
}

const NAV_COLLAPSED_KEY = 'choichoi_nav_collapsed';
const CASHIER_NAME_KEY = 'choichoi_cashier_name';
const POPUP_ID_KEY = 'choichoi_popup_id';
const POPUP_NAME_KEY = 'choichoi_popup_name';
const WORKER_ROLE_KEY = 'choichoi_worker_role';
const APP_ROLE_KEY = 'choichoi_app_role';
// user_profiles 이름 재조회를 브라우저 세션당 1회로 제한 — NavBar는 모든 페이지에서 마운트되므로
// 매 이동마다 SELECT가 나가던 것을 캐시 우선으로 바꾼다
const PROFILE_SYNCED_KEY = 'choichoi_profile_synced';

const ALL_NAV_LINKS = [
  { href: '/pos', label: 'POS', minRole: 'user' },
  { href: '/stats', label: '통계', minRole: 'admin' },
  { href: '/roster', label: '일정표', minRole: 'manager' },
  { href: '/hr', label: '인사', minRole: 'admin' },
  { href: '/inventory', label: '재고', minRole: 'manager' },
  { href: '/memo', label: '메모', minRole: 'user' },
  { href: '/my/schedule', label: '스케줄', minRole: 'user' },
  { href: '/my', label: 'MY', minRole: 'user' },
  { href: '/settings', label: '설정', minRole: 'admin' },
] as const;

const ROLE_RANK: Record<UserAppRole, number> = { user: 0, manager: 1, admin: 2 };

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
  const [role, setRole] = useState<UserAppRole>('user');
  const [cashierName, setCashierName] = useState<string | null>(null);
  const [popupName, setPopupName] = useState<string | null>(null);
  const [popupId, setPopupId] = useState('0');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const ownActiveCashiers = usePresence(activeCashiersProp !== undefined ? null : cashierName);
  const activeCashiers = activeCashiersProp ?? ownActiveCashiers;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(NAV_COLLAPSED_KEY) === 'true');
      setCashierName(localStorage.getItem(CASHIER_NAME_KEY));
      setPopupName(localStorage.getItem(POPUP_NAME_KEY));
      setPopupId(localStorage.getItem(POPUP_ID_KEY) ?? '0');
      // 마지막으로 확인된 역할을 즉시 적용 — 아래 세션 조회가 실패해도 관리자 탭이 사라지지 않는다
      const cachedRole = localStorage.getItem(APP_ROLE_KEY);
      if (cachedRole === 'admin' || cachedRole === 'manager') setRole(cachedRole);
    } catch { /* ignore */ }

    const supabase = createSupabaseBrowserClient();

    const applyRole = (value: unknown) => {
      const appRole = toAppRole(value);
      setRole(appRole);
      try { localStorage.setItem(APP_ROLE_KEY, appRole); } catch { /* ignore */ }
    };

    const loadProfile = async () => {
      // getUser()는 마운트마다 네트워크 왕복이라 간헐적으로 실패하면 role이 'user'로
      // 남아 관리자 탭이 사라졌다 — 로컬 세션 기반 getSession()으로 대체하고,
      // 실패 시에는 위에서 적용한 캐시 역할을 그대로 유지한다.
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
      try {
        ({ data: { session } } = await withTimeout(supabase.auth.getSession(), 5000, '권한 확인'));
      } catch { return; }
      if (!session) return;
      applyRole(session.user.user_metadata?.role);

      // 이름이 캐시돼 있고 이 세션에서 이미 동기화했다면 네트워크 조회 생략
      try {
        if (localStorage.getItem(CASHIER_NAME_KEY) && sessionStorage.getItem(PROFILE_SYNCED_KEY)) return;
      } catch { /* ignore */ }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name')
        .eq('id', session.user.id)
        .maybeSingle()
      const displayName = profile?.name
        ?? session.user.user_metadata?.name
        ?? session.user.email?.split('@')[0]
        ?? null
      if (displayName) {
        try { localStorage.setItem(CASHIER_NAME_KEY, displayName) } catch { /* ignore */ }
        setCashierName(displayName)
      }
      try { sessionStorage.setItem(PROFILE_SYNCED_KEY, '1') } catch { /* ignore */ }
    }
    loadProfile()

    // 콜백이 세션을 직접 전달하므로 getUser() 재조회가 필요 없다
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        try {
          localStorage.removeItem(APP_ROLE_KEY);
          sessionStorage.removeItem(PROFILE_SYNCED_KEY);
        } catch { /* ignore */ }
        setRole('user');
      } else if (session) {
        applyRole(session.user.user_metadata?.role);
      }
      // 그 외 세션 없는 이벤트에서는 캐시 역할 유지 (일시적 상태로 탭이 사라지지 않도록)
    });
    return () => subscription.unsubscribe();
  }, []);

  const visibleLinks = useMemo(
    () => ALL_NAV_LINKS.filter((l) => ROLE_RANK[role] >= ROLE_RANK[l.minRole]),
    [role]
  );

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(NAV_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const confirmLogout = () => {
    try {
      localStorage.removeItem(CASHIER_NAME_KEY);
      localStorage.removeItem(POPUP_ID_KEY);
      localStorage.removeItem(POPUP_NAME_KEY);
      localStorage.removeItem(WORKER_ROLE_KEY);
      localStorage.removeItem(APP_ROLE_KEY);
      sessionStorage.removeItem(PROFILE_SYNCED_KEY);
      // 서버 프리페치용 팝업 쿠키도 함께 제거 (password-gate에서 저장)
      document.cookie = `${POPUP_ID_KEY}=; path=/; max-age=0`;
    } catch { /* ignore */ }
    // signOut 응답을 기다리지 않고 즉시 이동한다 — 호출이 멈추거나 느려도
    // /pos에 머무는 일 없이 항상 역할 선택 화면(/)으로 보낸다.
    try {
      createSupabaseBrowserClient().auth.signOut().catch(() => {});
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
                    {/* PWA(홈 화면 앱)에는 브라우저 새로고침 UI가 없어 전체 리로드 버튼 제공 */}
                    <button
                      onClick={() => window.location.reload()}
                      title="새로고침"
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-canvas-soft text-ink-faint hover:bg-primary-50 hover:text-primary-700 border-none cursor-pointer transition-all duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
                        <polyline points="21 3 21 9 15 9"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => setShowLogoutConfirm(true)}
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
                      onClick={() => setShowLogoutConfirm(true)}
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

      {mounted && createPortal(
        <AnimatePresence>
          {showLogoutConfirm && (
            <motion.div
              key="logout-confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
              onClick={(e) => { if (e.target === e.currentTarget) setShowLogoutConfirm(false); }}
            >
              <motion.div
                key="logout-confirm-panel"
                initial={{ y: 16, opacity: 0, scale: 0.97 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 16, opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="bg-canvas w-full max-w-[320px] rounded-xl shadow-level-2 border border-hairline p-5"
              >
                <h3 className="m-0 mb-1.5 text-[16px] font-bold text-ink">로그아웃하시겠습니까?</h3>
                <p className="m-0 mb-5 text-[13px] text-ink-muted">다시 로그인해야 이용할 수 있습니다.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-2.5 rounded-lg border border-hairline bg-canvas-soft text-ink-secondary text-[13px] font-semibold cursor-pointer hover:bg-[#ececec] transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={confirmLogout}
                    className="flex-1 py-2.5 rounded-lg border-none bg-rose-500 text-white text-[13px] font-bold cursor-pointer hover:bg-rose-600 transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
  </>
  );
}
