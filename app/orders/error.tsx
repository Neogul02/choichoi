'use client';

import ErrorScreen from '@/components/ErrorScreen';

export default function OrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} title="주문 페이지 오류" />;
}
