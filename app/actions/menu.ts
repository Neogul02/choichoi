'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { wrap, requireAdmin, requireAuth } from './_base';
import { notifyDiscord } from '@/lib/discord';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import type { ApiResponse, FetchMenuItemsResponse } from '@/types/api';
import type { MenuItem } from '@/types/database';

const MenuItemSchema = z.object({
  name: z.string().min(1, '메뉴 이름을 입력해주세요').max(20, '메뉴 이름은 20자 이하여야 합니다'),
  price: z.number().int().refine((v) => v !== 0, '가격은 0이 될 수 없습니다'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
  emoji: z.string().trim().max(8, '이모지는 하나만 입력해주세요').nullable().optional(),
});

async function getMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

async function getAllMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

async function addMenuItem(name: string, price: number, color: string, emoji: string | null): Promise<MenuItem> {
  const { data: lastItem, error: lastItemError } = await supabaseAdmin
    .from('menu_items')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastItemError) throw lastItemError

  const nextDisplayOrder = ((lastItem?.display_order as number) || 0) + 1

  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .insert([
      {
        name,
        price,
        color,
        emoji,
        stock: 999,
        is_active: true,
        display_order: nextDisplayOrder,
      },
    ])
    .select()
    .single()

  if (error) throw error
  return data as MenuItem
}

async function updateMenuItem(id: number, name: string, price: number, color: string, emoji: string | null): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({ name, price, color, emoji, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as MenuItem
}

async function deleteMenuItem(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('menu_items')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

async function updateMenuItemStock(id: number, stock: number | null): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({ stock, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MenuItem
}

async function updateMenuItemSoldOut(id: number, soldOut: boolean): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({ is_sold_out: soldOut, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MenuItem
}

async function updateMenuOrder(orderedIds: number[]): Promise<void> {
  const updates = orderedIds.map((id, index) =>
    supabaseAdmin
      .from('menu_items')
      .update({
        display_order: index + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}


// fetchMenuItems·updateMenuStock은 /pos(오픈 페이지)와 공유돼 인증 게이트를 두지 않는다 — 나머지는 /settings(admin 전용) 전용
export async function fetchMenuItems(): Promise<FetchMenuItemsResponse> { return wrap(getMenuItems); }
export async function getAllMenu(): Promise<FetchMenuItemsResponse> { return wrap(async () => { await requireAdmin(); return getAllMenuItems(); }); }

export async function createNewMenuItem(name: string, price: number, color: string, emoji?: string | null): Promise<ApiResponse<MenuItem>> {
  const parsed = MenuItemSchema.safeParse({ name, price, color, emoji });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await wrap(async () => { await requireAdmin(); return addMenuItem(parsed.data.name, parsed.data.price, parsed.data.color, parsed.data.emoji || null); });
  return result;
}

export async function editMenuItem(id: number, name: string, price: number, color: string, emoji?: string | null): Promise<ApiResponse<MenuItem>> {
  const parsed = MenuItemSchema.safeParse({ name, price, color, emoji });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await wrap(async () => { await requireAdmin(); return updateMenuItem(id, parsed.data.name, parsed.data.price, parsed.data.color, parsed.data.emoji || null); });
  return result;
}

export async function removeMenuItem(id: number): Promise<ApiResponse> {
  const result = await wrap(async () => { await requireAdmin(); return deleteMenuItem(id); });
  return result;
}

export async function updateMenuStock(id: number, stock: number | null): Promise<ApiResponse<MenuItem>> {
  const parsed = z.object({
    id: z.number().int().positive(),
    stock: z.number().int().nullable(),
  }).safeParse({ id, stock });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAuth(); return updateMenuItemStock(parsed.data.id, parsed.data.stock); });
}

export async function setMenuItemSoldOut(id: number, soldOut: boolean): Promise<ApiResponse<MenuItem>> {
  const parsed = z.object({ id: z.number().int().positive(), soldOut: z.boolean() }).safeParse({ id, soldOut });
  if (!parsed.success) return { success: false, error: '올바르지 않은 요청입니다' };
  return wrap(async () => { await requireAdmin(); return updateMenuItemSoldOut(parsed.data.id, parsed.data.soldOut); });
}

export async function reorderMenuItems(orderedIds: number[]): Promise<ApiResponse> {
  const parsed = z.array(z.number().int().positive()).min(1).safeParse(orderedIds);
  if (!parsed.success) return { success: false, error: '올바르지 않은 메뉴 순서입니다' };
  const result = await wrap(async () => { await requireAdmin(); return updateMenuOrder(parsed.data); });
  if (result.success) after(() => notifyDiscord('reorder', '↕️ 메뉴 순서 변경', `${orderedIds.length}개 메뉴 순서 조정`));
  return result;
}
