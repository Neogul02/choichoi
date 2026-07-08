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
  const qty = totalQty(ing);
  if (qty === 0) return 'out';
  const boxesLeft = qty / ing.container_size;
  if (boxesLeft <= ing.reorder_at_containers) return 'low';
  if (boxesLeft <= ing.reorder_at_containers + 1) return 'warn';
  return 'ok';
}

export function useInventory() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await fetchIngredients();
    if (res.success && res.data) setIngredients(res.data);
    else if (!res.success) toast.error(`재료 조회 실패: ${res.error}`);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`inventory-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { ingredients, isLoading, reload: load };
}
