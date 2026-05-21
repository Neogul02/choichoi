'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchRecentOrderLogs } from '@/app/actions';
import type { OrderLogEntry } from '@/types/api';

export function useLiveLog() {
  const [logs, setLogs] = useState<OrderLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetchRecentOrderLogs(20);
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
