'use client';

import ErrorScreen from '@/components/ErrorScreen';

export default function PosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} title="POS 오류가 발생했습니다" />;
}
