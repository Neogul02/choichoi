'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { useResumeRevalidate } from '@/hooks/useResumeRevalidate';

function ResumeRevalidate() {
  useResumeRevalidate();
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ResumeRevalidate />
      {children}
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
