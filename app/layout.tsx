import type { Metadata, Viewport } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
// 셀프호스팅 Pretendard (dynamic subset) — CDN 렌더 블로킹 제거, 폰트 파일은 빌드 시 번들에 포함
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import Providers from './providers';
import PasswordGate from './password-gate';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <PasswordGate>{children}</PasswordGate>
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
