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
};

export default nextConfig;
