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

/** initialIngredients가 있으면(서버 프리페치) 마운트 시 재조회를 건너뛰고 실시간 구독만 연다 */
export function useInventory(initialIngredients?: Ingredient[] | null) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients ?? []);
  const [isLoading, setIsLoading] = useState(initialIngredients == null);

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
    if (initialIngredients == null) load();
    const channel = supabase
      .channel(`inventory-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, initialIngredients]);

  return { ingredients, isLoading, reload: load, applyLocalDelta };
}
