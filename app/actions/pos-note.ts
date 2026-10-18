'use server';

import * as Y from 'yjs';
import { wrap, requireAuth } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import { POS_NOTE_TEXT_KEY, base64ToBytes, bytesToBase64, loadNoteDoc as loadDoc } from '@/lib/posNoteSync';
import type { ApiResponse } from '@/types/api';

export interface PosNote {
  ydoc: string;
  updated_by: string | null;
  updated_at: string;
}

interface PosNoteRow {
  content: string;
  ydoc: string | null;
  updated_by: string | null;
  updated_at: string;
}

// 메모 몇 KB면 충분하다 — 비정상적으로 큰 상태로 행이 부풀지 않게만 막는다.
// 글자 수 제한은 textarea(maxLength)에서 건다: 여기서 거절하면 그 기기의 문서는 이미 바뀐 채라
// 이후 저장이 영영 실패한다(동시 입력으로 합계가 살짝 넘는 경우도 마찬가지).
const MAX_UPDATE_B64 = 256 * 1024;
const CAS_RETRIES = 5;

async function readRow(): Promise<PosNoteRow> {
  const { data, error } = await supabaseAdmin
    .from('pos_note')
    .select('content, ydoc, updated_by, updated_at')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

// updated_at이 읽은 그대로일 때만 쓴다(CAS). 두 저장이 겹치면 한쪽이 상대 변경을 모른 채 덮어써서
// 그 사이 글이 DB에서 빠지므로, 실패한 쪽은 다시 읽어 합친다.
async function writeIfUnchanged(prevUpdatedAt: string, patch: Partial<PosNoteRow>): Promise<PosNoteRow | null> {
  const { data, error } = await supabaseAdmin
    .from('pos_note')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('updated_at', prevUpdatedAt)
    .select('content, ydoc, updated_by, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data;
}

function toNote(row: PosNoteRow & { ydoc: string }): PosNote {
  return { ydoc: row.ydoc, updated_by: row.updated_by, updated_at: row.updated_at };
}

async function getPosNote(): Promise<PosNote> {
  for (let i = 0; i < CAS_RETRIES; i++) {
    const row = await readRow();
    const { doc, changed } = loadDoc(row);
    if (!changed && row.ydoc) return toNote({ ...row, ydoc: row.ydoc });
    const saved = await writeIfUnchanged(row.updated_at, {
      ydoc: bytesToBase64(Y.encodeStateAsUpdate(doc)),
      updated_by: row.updated_by,
    });
    if (saved?.ydoc) return toNote({ ...saved, ydoc: saved.ydoc });
  }
  throw new Error('메모를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

async function mergePosNote(updateB64: string, updatedBy?: string): Promise<PosNote> {
  const incoming = base64ToBytes(updateB64);
  for (let i = 0; i < CAS_RETRIES; i++) {
    const row = await readRow();
    const { doc } = loadDoc(row);
    Y.applyUpdate(doc, incoming);
    const content = doc.getText(POS_NOTE_TEXT_KEY).toString();

    const saved = await writeIfUnchanged(row.updated_at, {
      content,
      ydoc: bytesToBase64(Y.encodeStateAsUpdate(doc)),
      updated_by: updatedBy ?? null,
    });
    if (saved?.ydoc) return toNote({ ...saved, ydoc: saved.ydoc });
  }
  throw new Error('다른 저장과 겹쳐 저장하지 못했습니다. 잠시 후 자동으로 다시 저장됩니다.');
}

export async function fetchPosNote(): Promise<ApiResponse<PosNote>> {
  return wrap(async () => { await requireAuth(); return getPosNote(); });
}

// 클라이언트의 문서 상태(Yjs update, base64)를 DB 상태와 합쳐 저장한다. 합치기는 순서·중복과 무관하므로
// 같은 내용을 여러 기기가 저장해도 결과가 같다.
export async function updatePosNote(updateB64: string, updatedBy?: string): Promise<ApiResponse<PosNote>> {
  if (typeof updateB64 !== 'string' || updateB64.length === 0 || updateB64.length > MAX_UPDATE_B64) {
    return { success: false, error: '메모 데이터가 올바르지 않습니다' };
  }
  return wrap(async () => { await requireAuth(); return mergePosNote(updateB64, updatedBy); });
}
