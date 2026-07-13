'use server';

import { z } from 'zod';
import { wrap } from './_base';
import {
  getPopupEvents,
  createPopupEvent,
  deletePopupEvent,
  updatePopupEvent,
  setPopupEventActive,
} from '@/lib/supabase-admin';
import type { ApiResponse, FetchEventsResponse } from '@/types/api';
import type { PopupEvent } from '@/types/database';

const PopupEventSchema = z.object({
  name: z.string().min(1, '행사명을 입력해주세요').max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다'),
});

// ── Popup Events ──────────────────────────────────────────────────────────────

export async function fetchPopupEvents(): Promise<FetchEventsResponse> { return wrap(getPopupEvents); }

/** 활성 팝업만 조회 — 로그인 게이트·디스플레이 등 "진행 중인 팝업" 선택 화면용 */
export async function fetchActivePopupEvents(): Promise<FetchEventsResponse> { return wrap(() => getPopupEvents(true)); }

export async function togglePopupEventActive(id: number, isActive: boolean): Promise<ApiResponse<PopupEvent>> {
  return wrap(() => setPopupEventActive(id, isActive));
}

export async function createNewPopupEvent(name: string, startDate: string, endDate: string, storeId: number | null): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => createPopupEvent(parsed.data.name, parsed.data.startDate, parsed.data.endDate, storeId));
}

export async function removePopupEvent(id: number): Promise<ApiResponse> { return wrap(() => deletePopupEvent(id)); }

export async function editPopupEvent(id: number, name: string, startDate: string, endDate: string, storeId: number | null): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => updatePopupEvent(id, parsed.data.name, parsed.data.startDate, parsed.data.endDate, storeId));
}
