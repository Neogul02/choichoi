'use server';

import { z } from 'zod';
import { wrap } from './_base';
import {
  getIngredients,
  addRestock,
  physicalInventory,
  getRecipesWithIngredients,
  upsertRecipe,
  deleteRecipe,
  getRecentDeductions,
  getRecentOrderLogs,
  updateIngredientMeta,
  addIngredient,
  deleteIngredient,
} from '@/lib/supabase-admin';
import type {
  ApiResponse,
  FetchIngredientsResponse,
  FetchRecipesResponse,
  FetchDeductionEventsResponse,
  FetchOrderLogsResponse,
} from '@/types/api';
import type { Ingredient } from '@/types/database';

const CreateIngredientSchema = z.object({
  id: z.string().uuid('올바른 UUID 형식이어야 합니다'),
  name: z.string().min(1, '재료명을 입력해주세요').max(50, '재료명은 50자 이하여야 합니다'),
  category: z.enum(['빵', '크림', '과일', '패키지'] as const, { error: '올바른 카테고리를 선택해주세요' }),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
  unit_type: z.enum(['count', 'weight']),
  base_unit: z.string().min(1, '기본 단위를 입력해주세요'),
  container_unit: z.string().min(1, '용기 단위를 입력해주세요'),
  container_size: z.number().positive('용기 크기는 0보다 커야 합니다'),
  reorder_at_containers: z.number().int().min(0, '재주문 기준은 0 이상이어야 합니다'),
});

const RestockSchema = z.object({
  sealed: z.number().int().min(0, '밀봉 수량은 0 이상이어야 합니다'),
  opened: z.number().min(0, '개봉 수량은 0 이상이어야 합니다'),
});

export async function fetchIngredients(): Promise<FetchIngredientsResponse> { return wrap(getIngredients); }
export async function fetchRecipes(): Promise<FetchRecipesResponse> { return wrap(getRecipesWithIngredients); }
export async function fetchRecentDeductions(limit?: number): Promise<FetchDeductionEventsResponse> { return wrap(() => getRecentDeductions(limit)); }
export async function fetchRecentOrderLogs(limit?: number): Promise<FetchOrderLogsResponse> { return wrap(() => getRecentOrderLogs(limit)); }

export async function restockIngredient(id: string, sealed: number, opened: number, note?: string, by?: string): Promise<ApiResponse> {
  const parsed = RestockSchema.safeParse({ sealed, opened });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => addRestock(id, sealed, opened, note, by));
}

export async function setPhysicalInventory(id: string, sealed: number, opened: number): Promise<ApiResponse<Ingredient>> {
  return wrap(() => physicalInventory(id, sealed, opened));
}

export async function saveRecipe(menu_id: number, ingredient_id: string, qty: number): Promise<ApiResponse> {
  const parsed = z.object({
    qty: z.number().positive('수량은 0보다 커야 합니다'),
  }).safeParse({ qty });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => upsertRecipe(menu_id, ingredient_id, qty));
}

export async function removeRecipe(menu_id: number, ingredient_id: string): Promise<ApiResponse> {
  return wrap(() => deleteRecipe(menu_id, ingredient_id));
}

export async function updateIngredientSettings(
  id: string,
  updates: { container_size?: number; reorder_at_containers?: number; vendor?: string }
): Promise<ApiResponse<Ingredient>> {
  return wrap(() => updateIngredientMeta(id, updates));
}

export async function createIngredient(data: {
  id: string; name: string; category: string; color: string;
  unit_type: 'count' | 'weight'; base_unit: string; container_unit: string;
  container_size: number; reorder_at_containers: number;
}): Promise<ApiResponse<Ingredient>> {
  const parsed = CreateIngredientSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => addIngredient(parsed.data));
}

export async function deleteIngredientById(id: string): Promise<ApiResponse> {
  return wrap(() => deleteIngredient(id));
}
