'use server';

import { z } from 'zod';
import { wrap, requireAuth } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import type { ApiResponse } from '@/types/api';

export interface PosNote {
  content: string;
  updated_by: string | null;
  updated_at: string;
}

const SaveSchema = z.object({
  content: z.string().max(2000, '내용은 2000자 이하여야 합니다'),
});

async function getPosNote(): Promise<PosNote> {
  const { data, error } = await supabaseAdmin
    .from('pos_note')
    .select('content, updated_by, updated_at')
    .eq('id', 1)
    .single()
  if (error) throw error
  return data
}

async function savePosNote(content: string, updatedBy?: string): Promise<PosNote> {
  const { data, error } = await supabaseAdmin
    .from('pos_note')
    .update({ content, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('content, updated_by, updated_at')
    .single()
  if (error) throw error
  return data
}

export async function fetchPosNote(): Promise<ApiResponse<PosNote>> {
  return wrap(getPosNote);
}

export async function updatePosNote(content: string, updatedBy?: string): Promise<ApiResponse<PosNote>> {
  const parsed = SaveSchema.safeParse({ content });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => { await requireAuth(); return savePosNote(parsed.data.content, updatedBy); });
}
