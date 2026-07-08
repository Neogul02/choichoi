'use server';

import { z } from 'zod';
import { wrap } from './_base';
import {
  getIngredients,
  addRestock,
  physicalInventory,
  updateIngredientMeta,
  addIngredient,
  deleteIngredient,
} from '@/lib/supabase-admin';
import type {
  ApiResponse,
  FetchIngredientsResponse,
} from '@/types/api';
import type { Ingredient } from '@/types/database';

const CreateIngredientSchema = z.object({
  id: z.string().min(1, 'ID를 입력해주세요').max(50, 'ID는 50자 이하여야 합니다').regex(/^[a-z0-9_]+$/, 'ID는 영문 소문자, 숫자, 밑줄(_)만 사용할 수 있습니다'),
  name: z.string().min(1, '재료명을 입력해주세요').max(50, '재료명은 50자 이하여야 합니다'),
  category: z.enum(['빵', '크림', '과일', '패키지'] as const, { error: '올바른 카테고리를 선택해주세요' }),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
  unit_type: z.enum(['count', 'weight']),
  base_unit: z.string().min(1, '기본 단위를 입력해주세요'),
  container_unit: z.string().min(1, '용기 단위를 입력해주세요'),
  container_size: z.number().positive('용기 크기는 0보다 커야 합니다'),
  vendor: z.string().max(100, '거래처는 100자 이하여야 합니다').optional(),
});

const UUID = z.string().min(1, 'ID를 입력해주세요').max(50).regex(/^[a-z0-9_]+$/, '올바른 ID 형식이어야 합니다');

const RestockSchema = z.object({
  sealed: z.number().int('밀봉 수량은 정수여야 합니다'),
  opened: z.number().int('개봉 수량은 정수여야 합니다'),
});

export async function fetchIngredients(): Promise<FetchIngredientsResponse> { return wrap(getIngredients); }

export async function restockIngredient(id: string, sealed: number, opened: number, note?: string, by?: string): Promise<ApiResponse> {
  const idParsed = UUID.safeParse(id);
  if (!idParsed.success) return { success: false, error: idParsed.error.issues[0].message };
  const parsed = RestockSchema.safeParse({ sealed, opened });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => addRestock(id, sealed, opened, note, by));
}

export async function setPhysicalInventory(id: string, sealed: number, opened: number): Promise<ApiResponse<Ingredient>> {
  return wrap(() => physicalInventory(id, sealed, opened));
}

export async function updateIngredientSettings(
  id: string,
  updates: { container_size?: number; vendor?: string | null }
): Promise<ApiResponse<Ingredient>> {
  return wrap(() => updateIngredientMeta(id, updates));
}

export async function createIngredient(data: {
  id: string; name: string; category: string; color: string;
  unit_type: 'count' | 'weight'; base_unit: string; container_unit: string;
  container_size: number; vendor?: string;
}): Promise<ApiResponse<Ingredient>> {
  const parsed = CreateIngredientSchema.safeParse(data);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => addIngredient(parsed.data));
}

export async function deleteIngredientById(id: string): Promise<ApiResponse> {
  const parsed = UUID.safeParse(id);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => deleteIngredient(id));
}
