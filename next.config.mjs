import { createRequire } from 'module';

const { version: appVersion } = createRequire(import.meta.url)('./package.json');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // next build 실행 시점에 한 번 고정되는 값 — 배포 후 클라이언트에서
  // "지금 떠 있는 코드가 최신 배포인지"를 확인할 수 있도록 개발자도구에 노출한다.
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_GIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  },
  // 고객 화면 일시 비활성화 — 분기 페이지(/)를 거치지 않고 바로 직원 화면(/pos)으로 들어간다.
  // 페이지 코드는 그대로 두었으니 다시 켤 때는 이 블록만 지우면 된다.
  // permanent: false(307)여야 브라우저가 리다이렉트를 캐시하지 않아 되돌린 즉시 원래 화면이 열린다.
  // /pos는 proxy.ts를 거치므로 kiosk 계정은 그대로 /attendance로 보내진다.
  async redirects() {
    return [
      { source: '/', destination: '/pos', permanent: false },
      { source: '/display', destination: '/pos', permanent: false },
    ];
  },
};

export default nextConfig;
