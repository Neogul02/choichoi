'use client';

import ErrorScreen from '@/components/ErrorScreen';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} homeHref="/stats" homeLabel="통계로 이동" />;
}
