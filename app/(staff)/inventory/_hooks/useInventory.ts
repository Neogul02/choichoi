'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchIngredients } from '@/app/actions/inventory';
import type { Ingredient } from '@/types/database';

export function totalQty(ing: Ingredient): number {
  return ing.total_count;
}

export type IngredientStatus = 'out' | 'low' | 'warn' | 'ok';

// reorder_at(발주 기준 수량)을 실제 저재고 판정에 사용 — warn은 발주 기준의 2배 이하일 때
export function getStatus(ing: Ingredient): IngredientStatus {
  if (ing.total_count <= 0) return 'out';
  if (ing.total_count <= ing.reorder_at) return 'low';
  if (ing.total_count <= ing.reorder_at * 2) return 'warn';
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

  const applyLocalDelta = useCallback((id: string, delta: number) => {
    setIngredients(prev => prev.map(ing => ing.id === id
      ? { ...ing, total_count: Math.max(0, ing.total_count + delta) }
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
