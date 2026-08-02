'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/app/actions/error-report';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  homeHref?: string;
  homeLabel?: string;
}

/** 에러 바운더리 공용 화면 — 오프라인 구분, digest 표시, 서버 경유 오류 수집 */
export default function ErrorScreen({ error, reset, title = '오류가 발생했습니다', homeHref, homeLabel }: Props) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    console.error(error);
    // 오프라인이면 수집 요청 자체가 실패하므로 스킵 — 복구 후 재시도 시 다시 잡힌다
    if (navigator.onLine) {
      reportClientError({
        message: error.message || String(error),
        digest: error.digest,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }).catch(() => {});
    }
  }, [error]);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-[#f5f6f7] flex items-center justify-center p-4">
      <div className="text-center max-w-[360px]">
        <h2 className="text-xl font-extrabold text-ink m-0 mb-2">{offline ? '네트워크 연결 없음' : title}</h2>
        <p className="text-sm text-ink-muted m-0 mb-4">
          {offline ? '네트워크 연결을 확인한 뒤 다시 시도해주세요.' : error.message || '알 수 없는 오류입니다.'}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg border-none bg-primary-700 text-white text-sm font-bold cursor-pointer hover:bg-primary-800 transition"
          >
            다시 시도
          </button>
          {homeHref && (
            <Link href={homeHref} className="px-4 py-2 rounded-lg border border-hairline bg-canvas text-sm font-bold text-ink-secondary no-underline hover:bg-canvas-soft transition">
              {homeLabel ?? '홈으로'}
            </Link>
          )}
        </div>
        {error.digest && (
          <p className="text-[11px] text-ink-faint m-0 mt-4">오류 코드: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
