'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchIngredients, fetchRecipes } from '@/app/actions';
import type { Ingredient, Recipe } from '@/types/database';
import type { MakeableResult } from '@/types/api';

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

function calcMakeable(ingredients: Ingredient[], recipes: Recipe[]): MakeableResult[] {
  const menuMap = new Map<number, { name: string; items: Recipe[] }>();
  for (const r of recipes) {
    if (!menuMap.has(r.menu_id)) {
      menuMap.set(r.menu_id, { name: r.menu_items?.name ?? `메뉴 ${r.menu_id}`, items: [] });
    }
    menuMap.get(r.menu_id)!.items.push(r);
  }

  const ingMap = new Map(ingredients.map((i) => [i.id, i]));

  return Array.from(menuMap.entries()).map(([menu_id, { name, items }]) => {
    let minCount = Infinity;
    let bottleneck: string | null = null;

    for (const item of items) {
      const ing = ingMap.get(item.ingredient_id);
      if (!ing) { minCount = 0; bottleneck = item.ingredient_id; break; }
      const possible = Math.floor(totalQty(ing) / item.qty_per_unit);
      if (possible < minCount) {
        minCount = possible;
        bottleneck = ing.name;
      }
    }

    return {
      menu_id,
      menu_name: name,
      count: minCount === Infinity ? 0 : minCount,
      bottleneck,
    };
  });
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

  const makeable = calcMakeable(ingredients, recipes);

  return { ingredients, recipes, makeable, isLoading, reload: load };
}
