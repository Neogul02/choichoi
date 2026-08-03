'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { wrap, requireAdmin } from './_base';
import { notifyDiscord } from '@/lib/discord';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import type { ApiResponse, FetchMenuItemsResponse, MenuSalesItem } from '@/types/api';
import type { MenuItem } from '@/types/database';

const MenuItemSchema = z.object({
  name: z.string().min(1, '메뉴 이름을 입력해주세요').max(20, '메뉴 이름은 20자 이하여야 합니다'),
  price: z.number().int().refine((v) => v !== 0, '가격은 0이 될 수 없습니다'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
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

async function addMenuItem(name: string, price: number, color: string): Promise<MenuItem> {
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

async function updateMenuItem(id: number, name: string, price: number, color: string): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({ name, price, color, updated_at: new Date().toISOString() })
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

/** 메뉴별 판매 집계 — orders.ts(주문 완료 알림)·stats.ts(메뉴별 매출 화면) 공용 */
export async function getMenuSalesByPeriod(
  startISO: string,
  endISO: string,
  popupId?: string | number | null,
): Promise<MenuSalesItem[]> {
  const { data, error } = await supabaseAdmin.rpc('get_menu_sales_by_period', {
    p_start: startISO,
    p_end: endISO,
    p_popup_id: popupId && popupId !== '0' ? Number(popupId) : null,
  })

  if (error) throw error

  return (data ?? []).map(
    (row: {
      menu_item_id: number
      item_name: string
      item_price: number
      item_color: string
      total_quantity: number
      total_revenue: number
    }) => ({
      id: row.menu_item_id,
      name: row.item_name,
      price: row.item_price,
      color: row.item_color,
      totalQuantity: Number(row.total_quantity),
      totalRevenue: Number(row.total_revenue),
    }),
  )
}

// fetchMenuItems·updateMenuStock은 /pos(오픈 페이지)와 공유돼 인증 게이트를 두지 않는다 — 나머지는 /settings(admin 전용) 전용
export async function fetchMenuItems(): Promise<FetchMenuItemsResponse> { return wrap(getMenuItems); }
export async function getAllMenu(): Promise<FetchMenuItemsResponse> { return wrap(async () => { await requireAdmin(); return getAllMenuItems(); }); }

export async function createNewMenuItem(name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  const parsed = MenuItemSchema.safeParse({ name, price, color });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await wrap(async () => { await requireAdmin(); return addMenuItem(parsed.data.name, parsed.data.price, parsed.data.color); });
  if (result.success) after(() => notifyDiscord('add', '🍞 메뉴 추가', `**${name}** — ₩${price.toLocaleString('ko-KR')}`));
  return result;
}

export async function editMenuItem(id: number, name: string, price: number, color: string): Promise<ApiResponse<MenuItem>> {
  const parsed = MenuItemSchema.safeParse({ name, price, color });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await wrap(async () => { await requireAdmin(); return updateMenuItem(id, parsed.data.name, parsed.data.price, parsed.data.color); });
  if (result.success) after(() => notifyDiscord('edit', '✏️ 메뉴 수정', `**${name}** — ₩${price.toLocaleString('ko-KR')}`));
  return result;
}

export async function removeMenuItem(id: number): Promise<ApiResponse> {
  const result = await wrap(async () => { await requireAdmin(); return deleteMenuItem(id); });
  if (result.success) after(() => notifyDiscord('delete', '🗑️ 메뉴 삭제', `ID: ${id}`));
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
  const result = await wrap(async () => { await requireAdmin(); return updateMenuOrder(parsed.data); });
  if (result.success) after(() => notifyDiscord('reorder', '↕️ 메뉴 순서 변경', `${orderedIds.length}개 메뉴 순서 조정`));
  return result;
}
