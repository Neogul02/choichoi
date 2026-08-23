'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { withTimeout } from '@/lib/utils';
import { APP_ROLE_KEY } from '@/lib/storage-keys';
import type { UserAppRole } from '@/types/database';

function toAppRole(value: unknown): UserAppRole {
  return value === 'admin' ? 'admin' : value === 'manager' ? 'manager' : 'user';
}

/**
 * 현재 로그인한 사용자의 role을 읽는 클라이언트 훅(NavBar.tsx와 동일한 캐시-우선 패턴 재사용).
 * 실제 접근 통제는 proxy.ts + 서버 액션이 담당 — 이 훅은 UI 노출 여부(편집 버튼 표시 등) 판단에만 쓴다.
 */
export function useCurrentRole(): { role: UserAppRole; canEdit: boolean } {
  const [role, setRole] = useState<UserAppRole>('user');

  useEffect(() => {
    try {
      const cached = localStorage.getItem(APP_ROLE_KEY);
      if (cached === 'admin' || cached === 'manager') setRole(cached);
    } catch { /* ignore */ }

    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000, '권한 확인');
        if (cancelled || !session) return;
        setRole(toAppRole(session.user.user_metadata?.role));
      } catch { /* ignore, 캐시된 role 유지 */ }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setRole('user'); return; }
      if (session) setRole(toAppRole(session.user.user_metadata?.role));
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return { role, canEdit: role === 'admin' || role === 'manager' };
}
