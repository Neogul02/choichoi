'use server';

import { z } from 'zod';
import { wrap, requireAuth, requireManagerOrAdmin } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import type { ApiResponse } from '@/types/api';
import type { FetchStorageBoardResponse } from '@/types/api';
import type { StorageObject, StorageObjectIcon, StorageObjectWithItems } from '@/types/database';

const ICONS = ['fridge', 'freezer', 'shelf', 'box', 'other'] as const;

const ObjectIdSchema = z.uuid('올바른 오브젝트 ID가 아닙니다');
const IngredientIdSchema = z.string().min(1).max(50);

const CreateObjectSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요').max(30, '이름은 30자 이하여야 합니다'),
  icon: z.enum(ICONS, { error: '올바른 아이콘을 선택해주세요' }),
  pos_x: z.number().min(0).max(100).optional(),
  pos_y: z.number().min(0).max(100).optional(),
});

const PositionSchema = z.object({
  pos_x: z.number().min(0).max(100),
  pos_y: z.number().min(0).max(100),
});

const RenameSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요').max(30, '이름은 30자 이하여야 합니다'),
});

async function getStorageBoard(): Promise<StorageObjectWithItems[]> {
  const [{ data: objects, error: objErr }, { data: items, error: itemsErr }] = await Promise.all([
    supabaseAdmin.from('storage_objects').select('*').order('sort_order', { ascending: true }),
    supabaseAdmin.from('storage_object_items').select('object_id, ingredient_id'),
  ]);
  if (objErr) throw objErr;
  if (itemsErr) throw itemsErr;

  const byObject = new Map<string, string[]>();
  for (const row of items ?? []) {
    const list = byObject.get(row.object_id) ?? [];
    list.push(row.ingredient_id);
    byObject.set(row.object_id, list);
  }

  return (objects ?? []).map((o) => ({
    ...(o as StorageObject),
    ingredient_ids: byObject.get(o.id) ?? [],
  }));
}

async function insertObject(name: string, icon: StorageObjectIcon, pos_x: number, pos_y: number, created_by?: string): Promise<StorageObject> {
  const { data, error } = await supabaseAdmin
    .from('storage_objects')
    .insert([{ name, icon, pos_x, pos_y, created_by: created_by ?? null }])
    .select()
    .single();
  if (error) throw error;
  return data as StorageObject;
}

async function updatePosition(id: string, pos_x: number, pos_y: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('storage_objects')
    .update({ pos_x, pos_y })
    .eq('id', id);
  if (error) throw error;
}

async function renameObject(id: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('storage_objects')
    .update({ name })
    .eq('id', id);
  if (error) throw error;
}

async function removeObject(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('storage_objects')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function linkIngredient(objectId: string, ingredientId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('storage_object_items')
    .upsert([{ object_id: objectId, ingredient_id: ingredientId }], { onConflict: 'object_id,ingredient_id' });
  if (error) throw error;
}

async function unlinkIngredient(objectId: string, ingredientId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('storage_object_items')
    .delete()
    .eq('object_id', objectId)
    .eq('ingredient_id', ingredientId);
  if (error) throw error;
}

/** 재고탭은 로그인한 모든 직원(user 포함)이 조회 가능 — 편집은 각 쓰기 액션에서 별도로 requireManagerOrAdmin() */
export async function fetchStorageBoard(): Promise<FetchStorageBoardResponse> {
  return wrap(async () => { await requireAuth(); return getStorageBoard(); });
}

export async function createStorageObject(name: string, icon: StorageObjectIcon, posX?: number, posY?: number): Promise<ApiResponse<StorageObject>> {
  const parsed = CreateObjectSchema.safeParse({ name, icon, pos_x: posX, pos_y: posY });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => {
    const user = await requireManagerOrAdmin();
    return insertObject(parsed.data.name, parsed.data.icon, parsed.data.pos_x ?? 50, parsed.data.pos_y ?? 50, user.name ?? user.email ?? undefined);
  });
}

export async function updateStorageObjectPosition(id: string, posX: number, posY: number): Promise<ApiResponse> {
  const idParsed = ObjectIdSchema.safeParse(id);
  if (!idParsed.success) return { success: false, error: idParsed.error.issues[0].message };
  const parsed = PositionSchema.safeParse({ pos_x: posX, pos_y: posY });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireManagerOrAdmin(); return updatePosition(id, parsed.data.pos_x, parsed.data.pos_y); });
}

export async function renameStorageObject(id: string, name: string): Promise<ApiResponse> {
  const idParsed = ObjectIdSchema.safeParse(id);
  if (!idParsed.success) return { success: false, error: idParsed.error.issues[0].message };
  const parsed = RenameSchema.safeParse({ name });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireManagerOrAdmin(); return renameObject(id, parsed.data.name); });
}

export async function deleteStorageObject(id: string): Promise<ApiResponse> {
  const idParsed = ObjectIdSchema.safeParse(id);
  if (!idParsed.success) return { success: false, error: idParsed.error.issues[0].message };
  return wrap(async () => { await requireManagerOrAdmin(); return removeObject(id); });
}

export async function addIngredientToObject(objectId: string, ingredientId: string): Promise<ApiResponse> {
  const objParsed = ObjectIdSchema.safeParse(objectId);
  if (!objParsed.success) return { success: false, error: objParsed.error.issues[0].message };
  const ingParsed = IngredientIdSchema.safeParse(ingredientId);
  if (!ingParsed.success) return { success: false, error: '올바른 재료가 아닙니다' };
  return wrap(async () => { await requireManagerOrAdmin(); return linkIngredient(objectId, ingredientId); });
}

export async function removeIngredientFromObject(objectId: string, ingredientId: string): Promise<ApiResponse> {
  const objParsed = ObjectIdSchema.safeParse(objectId);
  if (!objParsed.success) return { success: false, error: objParsed.error.issues[0].message };
  const ingParsed = IngredientIdSchema.safeParse(ingredientId);
  if (!ingParsed.success) return { success: false, error: '올바른 재료가 아닙니다' };
  return wrap(async () => { await requireManagerOrAdmin(); return unlinkIngredient(objectId, ingredientId); });
}
