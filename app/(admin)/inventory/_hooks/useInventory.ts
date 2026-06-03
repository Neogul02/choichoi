'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchIngredients, fetchRecipes } from '@/app/actions/inventory';
import type { Ingredient, Recipe } from '@/types/database';
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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const [ingRes, recRes] = await Promise.all([fetchIngredients(), fetchRecipes()]);
    if (ingRes.success && ingRes.data) setIngredients(ingRes.data);
    else if (!ingRes.success) toast.error(`재료 조회 실패: ${ingRes.error}`);
    if (recRes.success && recRes.data) setRecipes(recRes.data);
    else if (!recRes.success) toast.error(`레시피 조회 실패: ${recRes.error}`);
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

  return { ingredients, recipes, isLoading, reload: load };
}
