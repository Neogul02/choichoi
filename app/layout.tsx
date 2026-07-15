import type { Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
// 셀프호스팅 Pretendard (dynamic subset) — CDN 렌더 블로킹 제거, 폰트 파일은 빌드 시 번들에 포함
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import Providers from './providers';
import PasswordGate from './password-gate';

export const metadata: Metadata = {
  title: 'ChoiChoi POS',
  description: 'choichoi POS System',
  icons: { icon: '/choichoi-logo.png' },
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
