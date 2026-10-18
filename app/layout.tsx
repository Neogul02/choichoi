import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
// 셀프호스팅 Pretendard (dynamic subset) — CDN 렌더 블로킹 제거, 폰트 파일은 빌드 시 번들에 포함
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import Providers from './providers';
import { cookies } from 'next/headers';
import PasswordGate, { type GateInitial } from './password-gate';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { POPUP_ID_KEY } from '@/lib/storage-keys';

export const metadata: Metadata = {
  title: 'ChoiChoi POS',
  description: 'choichoi POS System',
  icons: { icon: '/choichoi-logo.png', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.json',
  // 홈 화면에 추가했을 때 사파리 주소창 없이 standalone 앱처럼 열리게 함
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ChoiChoi' },
};

// viewportFit: cover — 이게 없으면 env(safe-area-inset-*)가 항상 0으로 계산돼
// 아이폰 홈 인디케이터 회피 코드(POS 결제바, stats 모달 등)가 무효화된다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#084431',
};

// 로그인 게이트의 첫 렌더를 서버에서 정한다(password-gate.tsx GateInitial 참고).
// getClaims()는 JWT를 로컬 검증해 네트워크 왕복이 없다. 판정은 화면 표시용일 뿐이고 권한은 proxy.ts가 건다.
async function getGateInitial(): Promise<GateInitial> {
  const [supabase, cookieStore] = await Promise.all([createSupabaseServerClient(), cookies()]);
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { checked: true, authed: false };
  if (!cookieStore.get(POPUP_ID_KEY)?.value) return { checked: false, authed: false };
  return { checked: true, authed: true };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const gateInitial = await getGateInitial();
  return (
    <html lang="ko">
      {/* suppressHydrationWarning — 브라우저 확장이 React 하이드레이션 전에 <body>에 제 표식을
          심는다(`__processed_<uuid>__="true"` 같은 속성). 확장이 고친 DOM이 React에게는 "서버가 보낸
          HTML"로 보여 매번 하이드레이션 불일치로 잡힌다. 우리 코드는 <body>에 속성을 하나도 주지 않으므로
          여기서 가릴 진짜 불일치가 없다.
          이 플래그는 **이 엘리먼트 한 개**의 속성·텍스트에만 적용되고 자식 트리는 그대로 검사된다 —
          앱 안의 실제 하이드레이션 버그를 덮지 않는다. */}
      <body suppressHydrationWarning>
        <Providers>
          <PasswordGate initial={gateInitial}>{children}</PasswordGate>
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
