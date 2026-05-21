'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchRecentDeductions } from '@/app/actions';
import type { DeductionEvent } from '@/types/database';

export function useLiveLog() {
  const [logs, setLogs] = useState<DeductionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetchRecentDeductions(30);
    if (res.success && res.data) setLogs(res.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`deductions-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deduction_events' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { logs, isLoading };
}
