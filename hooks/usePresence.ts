'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function usePresence(cashierName: string | null): string[] {
  const [activeCashiers, setActiveCashiers] = useState<string[]>([]);
  const [clientId] = useState(() => Math.random().toString(36).slice(2, 10));
  const clientIdRef = useRef(clientId);

  useEffect(() => {
    if (!cashierName) return () => {};
    const clientId = clientIdRef.current;
    const popupId = (typeof window !== 'undefined' ? localStorage.getItem('choichoi_popup_id') : null) ?? '0';
    const channel = supabase.channel(`pos-presence-${popupId}`, {
      config: { presence: { key: clientId } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = [...new Set(Object.values(state).flat().map((p) => p.name))];
        setActiveCashiers(names);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ name: cashierName });
      });
    return () => { supabase.removeChannel(channel); };
  }, [cashierName]);

  return activeCashiers;
}
