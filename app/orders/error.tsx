'use client';

import { useEffect } from 'react';

export default function OrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4">
      <div className="text-center max-w-[360px]">
        <h2 className="text-xl font-extrabold text-ink m-0 mb-2">주문 페이지 오류</h2>
        <p className="text-sm text-ink-muted m-0 mb-4">{error.message || '알 수 없는 오류입니다.'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg border-none bg-primary-700 text-white text-sm font-bold cursor-pointer hover:bg-primary-800 transition"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
