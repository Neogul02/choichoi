'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface PresenceUser {
  name: string;
}

export function usePresence(cashierName: string | null): PresenceUser[] {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
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
        const seen = new Set<string>();
        const users: PresenceUser[] = [];
        for (const entries of Object.values(state)) {
          for (const p of entries) {
            if (!seen.has(p.name)) {
              seen.add(p.name);
              users.push({ name: p.name });
            }
          }
        }
        setActiveUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: cashierName });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [cashierName]);

  return activeUsers;
}
