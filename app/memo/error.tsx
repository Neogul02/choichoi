'use client';

import ErrorScreen from '@/components/ErrorScreen';

export default function MemoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} title="메모 페이지 오류" />;
}
