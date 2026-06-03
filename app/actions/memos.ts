'use server';

import { z } from 'zod';
import { wrap } from './_base';
import { getAllMemos, createMemo, updateMemo, deleteMemo } from '@/lib/supabase-admin';
import type { ApiResponse, FetchMemosResponse } from '@/types/api';
import type { Memo } from '@/types/database';

const MemoSchema = z.object({
  title: z.string().max(100).nullable(),
  content: z.string().min(1, '내용을 입력해주세요').max(2000, '내용은 2000자 이하여야 합니다'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '올바른 색상 코드를 입력해주세요'),
});

export async function fetchAllMemos(): Promise<FetchMemosResponse> { return wrap(getAllMemos); }

export async function createNewMemo(title: string, content: string, color: string): Promise<ApiResponse<Memo>> {
  const parsed = MemoSchema.safeParse({ title, content, color });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => createMemo(parsed.data.title, parsed.data.content, parsed.data.color));
}

export async function editMemo(id: number, title: string, content: string, color: string): Promise<ApiResponse<Memo>> {
  const parsed = MemoSchema.safeParse({ title, content, color });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => updateMemo(id, parsed.data.title, parsed.data.content, parsed.data.color));
}

export async function removeMemo(id: number): Promise<ApiResponse> { return wrap(() => deleteMemo(id)); }
