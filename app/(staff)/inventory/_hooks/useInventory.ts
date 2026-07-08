'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchIngredients } from '@/app/actions/inventory';
import type { Ingredient } from '@/types/database';

export function totalQty(ing: Ingredient): number {
  return ing.sealed_count * ing.container_size + ing.opened_remaining;
}

export type IngredientStatus = 'out' | 'low' | 'warn' | 'ok';

export function getStatus(ing: Ingredient): IngredientStatus {
  if (totalQty(ing) === 0) return 'out';
  if (ing.sealed_count === 0) return 'low';
  if (ing.sealed_count === 1) return 'warn';
  return 'ok';
}

export function useInventory() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const res = await fetchIngredients();
    if (res.success && res.data) setIngredients(res.data);
    else if (!res.success) toast.error(`재료 조회 실패: ${res.error}`);
    if (!silent) setIsLoading(false);
  }, []);

  const applyLocalDelta = useCallback((id: string, sealedDelta: number, openedDelta: number) => {
    setIngredients(prev => prev.map(ing => ing.id === id
      ? {
          ...ing,
          sealed_count: Math.max(0, ing.sealed_count + sealedDelta),
          opened_remaining: Math.max(0, ing.opened_remaining + openedDelta),
        }
      : ing
    ));
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`inventory-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { ingredients, isLoading, reload: load, applyLocalDelta };
}
