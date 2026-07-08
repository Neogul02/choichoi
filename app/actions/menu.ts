'use server';

import { z } from 'zod';
import { wrap } from './_base';
import { notifyDiscord } from '@/lib/discord';
import {
  getMenuItems,
  getAllMenuItems,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateMenuOrder,
  updateMenuItemStock,
} from '@/lib/supabase-admin';
import type { ApiResponse, FetchMenuItemsResponse } from '@/types/api';
import type { MenuItem } from '@/types/database';

const MenuItemSchema = z.object({
  name: z.string().min(1, '메뉴 이름을 입력해주세요').max(20, '메뉴 이름은 20자 이하여야 합니다'),
  price: z.number().int().refine((v) => v !== 0, '가격은 0이 될 수 없습니다'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
});

export async function fetchMenuItems(): Promise<FetchMenuItemsResponse> { return wrap(getMenuItems); }
export async function getAllMenu(): Promise<FetchMenuItemsResponse> { return wrap(getAllMenuItems); }

export async function createNewMenuItem(name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  const parsed = MenuItemSchema.safeParse({ name, price, color });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await wrap(() => addMenuItem(parsed.data.name, parsed.data.price, parsed.data.color));
  if (result.success) await notifyDiscord('add', '🍞 메뉴 추가', `**${name}** — ₩${price.toLocaleString('ko-KR')}`);
  return result;
}

export async function editMenuItem(id: number, name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  const parsed = MenuItemSchema.safeParse({ name, price, color });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await wrap(() => updateMenuItem(id, parsed.data.name, parsed.data.price, parsed.data.color));
  if (result.success) await notifyDiscord('edit', '✏️ 메뉴 수정', `**${name}** — ₩${price.toLocaleString('ko-KR')}`);
  return result;
}

export async function removeMenuItem(id: number): Promise<ApiResponse> {
  const result = await wrap(() => deleteMenuItem(id));
  if (result.success) await notifyDiscord('delete', '🗑️ 메뉴 삭제', `ID: ${id}`);
  return result;
}

export async function updateMenuStock(id: number, stock: number | null): Promise<ApiResponse<MenuItem>> {
  const parsed = z.object({
    id: z.number().int().positive(),
    stock: z.number().int().nullable(),
  }).safeParse({ id, stock });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => updateMenuItemStock(parsed.data.id, parsed.data.stock));
}

export async function reorderMenuItems(orderedIds: number[]): Promise<ApiResponse> {
  const parsed = z.array(z.number().int().positive()).min(1).safeParse(orderedIds);
  if (!parsed.success) return { success: false, error: '올바르지 않은 메뉴 순서입니다' };
  const result = await wrap(() => updateMenuOrder(parsed.data));
  if (result.success) await notifyDiscord('reorder', '↕️ 메뉴 순서 변경', `${orderedIds.length}개 메뉴 순서 조정`);
  return result;
}
