'use server';

import { z } from 'zod';
import { wrap, requireAuth } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import type { ApiResponse, FetchMemosResponse } from '@/types/api';
import type { Memo } from '@/types/database';

const MemoSchema = z.object({
  title: z.string().max(100).nullable(),
  content: z.string().min(1, '내용을 입력해주세요').max(2000, '내용은 2000자 이하여야 합니다'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
  type: z.enum(['note', 'checklist']).default('note'),
});

async function getAllMemos(): Promise<Memo[]> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

async function createMemo(title: string, content: string, color: string, type: 'note' | 'checklist' = 'note'): Promise<Memo> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .insert([{ title: title || null, content, color: color || '#fff9c4', type }])
    .select()
    .single()
  if (error) throw error
  return data as Memo
}

async function updateMemo(id: number, title: string, content: string, color: string, type: 'note' | 'checklist'): Promise<Memo> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .update({
      title: title || null,
      content,
      color: color || '#fff9c4',
      type,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Memo
}

async function deleteMemo(id: number): Promise<void> {
  const { error } = await supabaseAdmin.from('memos').delete().eq('id', id)
  if (error) throw error
}

async function toggleMemoPin(id: number, isPinned: boolean): Promise<Memo> {
  const { data, error } = await supabaseAdmin
    .from('memos')
    .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Memo
}

export async function fetchAllMemos(): Promise<FetchMemosResponse> { return wrap(getAllMemos); }

export async function createNewMemo(title: string, content: string, color: string, type: 'note' | 'checklist' = 'note'): Promise<ApiResponse<Memo>> {
  const parsed = MemoSchema.safeParse({ title, content, color, type });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAuth(); return createMemo(parsed.data.title, parsed.data.content, parsed.data.color, parsed.data.type); });
}

export async function editMemo(id: number, title: string, content: string, color: string, type: 'note' | 'checklist' = 'note'): Promise<ApiResponse<Memo>> {
  const parsed = MemoSchema.safeParse({ title, content, color, type });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAuth(); return updateMemo(id, parsed.data.title, parsed.data.content, parsed.data.color, parsed.data.type); });
}

export async function removeMemo(id: number): Promise<ApiResponse> { return wrap(async () => { await requireAuth(); return deleteMemo(id); }); }

export async function toggleMemoPinned(id: number, isPinned: boolean): Promise<ApiResponse<Memo>> {
  return wrap(async () => { await requireAuth(); return toggleMemoPin(id, isPinned); });
}
