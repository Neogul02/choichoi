'use server';

import { z } from 'zod';
import { wrap } from './_base';
import { getPosNote, savePosNote } from '@/lib/supabase-admin';
import type { ApiResponse } from '@/types/api';

export interface PosNote {
  content: string;
  updated_by: string | null;
  updated_at: string;
}

const SaveSchema = z.object({
  content: z.string().max(2000, '내용은 2000자 이하여야 합니다'),
});

export async function fetchPosNote(): Promise<ApiResponse<PosNote>> {
  return wrap(getPosNote);
}

export async function updatePosNote(content: string, updatedBy?: string): Promise<ApiResponse<PosNote>> {
  const parsed = SaveSchema.safeParse({ content });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => savePosNote(parsed.data.content, updatedBy));
}
