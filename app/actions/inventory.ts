'use server';

import { z } from 'zod';
import { wrap, requireManagerOrAdmin } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import type {
  ApiResponse,
  FetchIngredientsResponse,
} from '@/types/api';
import type { Ingredient } from '@/types/database';

const CreateIngredientSchema = z.object({
  id: z.string().min(1, 'ID를 입력해주세요').max(50, 'ID는 50자 이하여야 합니다').regex(/^[a-z0-9_]+$/, 'ID는 영문 소문자, 숫자, 밑줄(_)만 사용할 수 있습니다'),
  name: z.string().min(1, '재료명을 입력해주세요').max(50, '재료명은 50자 이하여야 합니다'),
  category: z.string().min(1).max(20).default('기타'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
  unit_type: z.enum(['count', 'weight']),
  base_unit: z.string().min(1, '기본 단위를 입력해주세요'),
  reorder_at: z.number().nonnegative('발주 기준 수량은 0 이상이어야 합니다'),
  vendor: z.string().max(100, '거래처는 100자 이하여야 합니다').optional(),
});

const UUID = z.string().min(1, 'ID를 입력해주세요').max(50).regex(/^[a-z0-9_]+$/, '올바른 ID 형식이어야 합니다');

async function getIngredients(): Promise<Ingredient[]> {
  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Ingredient[]
}

async function addRestock(
  ingredient_id: string,
  delta: number,
  note?: string,
  created_by?: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('apply_restock', {
    p_ingredient_id: ingredient_id,
    p_delta: delta,
    p_note: note ?? null,
    p_created_by: created_by ?? null,
  })
  if (error) throw error
}

async function physicalInventory(id: string, total_count: number): Promise<Ingredient> {
  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .update({ total_count: Math.max(0, total_count) })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Ingredient
}

async function addIngredient(data: {
  id: string
  name: string
  category: string
  color: string
  unit_type: 'count' | 'weight'
  base_unit: string
  reorder_at: number
  vendor?: string
  sort_order?: number
}): Promise<Ingredient> {
  const { data: row, error } = await supabaseAdmin
    .from('ingredients')
    .insert([{ ...data, sort_order: data.sort_order ?? 0 }])
    .select()
    .single()
  if (error) throw error
  return row as Ingredient
}

async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ingredients')
    .delete()
    .eq('id', id)
  if (error) throw error
}

async function updateIngredientMeta(
  id: string,
  updates: {
    reorder_at?: number
    vendor?: string | null
  },
): Promise<Ingredient> {
  const { data, error } = await supabaseAdmin
    .from('ingredients')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Ingredient
}

export async function fetchIngredients(): Promise<FetchIngredientsResponse> {
  return wrap(async () => { await requireManagerOrAdmin(); return getIngredients(); });
}

export async function restockIngredient(id: string, delta: number, note?: string, by?: string): Promise<ApiResponse> {
  const idParsed = UUID.safeParse(id);
  if (!idParsed.success) return { success: false, error: idParsed.error.issues[0].message };
  if (!Number.isFinite(delta)) return { success: false, error: '수량 변경값이 올바르지 않습니다.' };
  return wrap(async () => { await requireManagerOrAdmin(); return addRestock(id, delta, note, by); });
}

export async function setPhysicalInventory(id: string, total: number): Promise<ApiResponse<Ingredient>> {
  return wrap(async () => { await requireManagerOrAdmin(); return physicalInventory(id, total); });
}

export async function updateIngredientSettings(
  id: string,
  updates: { reorder_at?: number; vendor?: string | null }
): Promise<ApiResponse<Ingredient>> {
  return wrap(async () => { await requireManagerOrAdmin(); return updateIngredientMeta(id, updates); });
}

export async function createIngredient(data: {
  id: string; name: string; category: string; color: string;
  unit_type: 'count' | 'weight'; base_unit: string;
  reorder_at: number; vendor?: string;
}): Promise<ApiResponse<Ingredient>> {
  const parsed = CreateIngredientSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireManagerOrAdmin(); return addIngredient(parsed.data); });
}

export async function deleteIngredientById(id: string): Promise<ApiResponse> {
  const parsed = UUID.safeParse(id);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireManagerOrAdmin(); return deleteIngredient(id); });
}
