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
import { classifyStaffByPopupSchedule } from './staffPopups';
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

export async function createNewPopupEvent(name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const res = await wrap(() => createPopupEvent(parsed.data.name, parsed.data.startDate, parsed.data.endDate));
  // 기간 안에 이미 배정된 근무자가 있으면(드문 경우지만 과거 날짜로 소급 생성 등) 바로 팝업 소속으로 분류
  if (res.success && res.data) await classifyStaffByPopupSchedule(res.data.id);
  return res;
}

export async function removePopupEvent(id: number): Promise<ApiResponse> { return wrap(() => deletePopupEvent(id)); }

export async function editPopupEvent(id: number, name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const res = await wrap(() => updatePopupEvent(id, parsed.data.name, parsed.data.startDate, parsed.data.endDate));
  // 기간을 수정하면(연장 등) 새로 기간에 들어온 근무자를 다시 분류
  if (res.success && res.data) await classifyStaffByPopupSchedule(id);
  return res;
}
