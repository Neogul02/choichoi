'use server';

import { z } from 'zod';
import { wrap, requireAdmin, requireAuth } from './_base';
import { supabaseAdmin } from '@/lib/supabase-admin-client';
import { classifyStaffByPopupSchedule } from './staffPopups';
import { createDefaultCashierShifts } from './roster';
import type { ApiResponse, FetchEventsResponse } from '@/types/api';
import type { PopupClosedDay, PopupEvent } from '@/types/database';

const PopupEventSchema = z.object({
  name: z.string().min(1, '행사명을 입력해주세요').max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다'),
});

// ── Popup Events ──────────────────────────────────────────────────────────────

async function getPopupEvents(activeOnly = false): Promise<PopupEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .select('*')
    .order('start_date', { ascending: false })
    .limit(50)
  if (error) throw error
  const events = (data ?? []) as PopupEvent[]
  // is_active 컬럼이 아직 없는 DB에서도 동작하도록 JS 측에서 필터 (undefined → 활성 취급)
  return activeOnly ? events.filter(e => e.is_active !== false) : events
}

async function createPopupEvent(name: string, startDate: string, endDate: string): Promise<PopupEvent> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .insert([{ name, start_date: startDate, end_date: endDate }])
    .select()
    .single()
  if (error) throw error
  return data as PopupEvent
}

async function deletePopupEvent(id: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('popup_events')
    .delete()
    .eq('id', id)
  if (error) throw error
}

async function updatePopupEvent(id: number, name: string, startDate: string, endDate: string): Promise<PopupEvent> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .update({ name, start_date: startDate, end_date: endDate })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PopupEvent
}

async function setPopupEventActive(id: number, isActive: boolean): Promise<PopupEvent> {
  const { data, error } = await supabaseAdmin
    .from('popup_events')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as PopupEvent
}

export async function fetchPopupEvents(): Promise<FetchEventsResponse> { return wrap(getPopupEvents); }

/** 활성 팝업만 조회 — 로그인 게이트·디스플레이 등 "진행 중인 팝업" 선택 화면용 */
export async function fetchActivePopupEvents(): Promise<FetchEventsResponse> { return wrap(() => getPopupEvents(true)); }

export async function togglePopupEventActive(id: number, isActive: boolean): Promise<ApiResponse<PopupEvent>> {
  return wrap(async () => { await requireAdmin(); return setPopupEventActive(id, isActive); });
}

export async function createNewPopupEvent(name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const res = await wrap(async () => { await requireAdmin(); return createPopupEvent(parsed.data.name, parsed.data.startDate, parsed.data.endDate); });
  if (res.success && res.data) {
    // 기간 안에 이미 배정된 근무자가 있으면(드문 경우지만 과거 날짜로 소급 생성 등) 바로 팝업 소속으로 분류
    await classifyStaffByPopupSchedule(res.data.id);
    // 기본 파트(하루 전체)를 팝업 기간에 맞춰 미리 생성 — 읽을 때마다 자동생성하던 예전 방식은 삭제해도 되살아나는 문제가 있었다
    await createDefaultCashierShifts(res.data.id, parsed.data.startDate, parsed.data.endDate);
  }
  return res;
}

export async function removePopupEvent(id: number): Promise<ApiResponse> { return wrap(async () => { await requireAdmin(); return deletePopupEvent(id); }); }

export async function editPopupEvent(id: number, name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const res = await wrap(async () => { await requireAdmin(); return updatePopupEvent(id, parsed.data.name, parsed.data.startDate, parsed.data.endDate); });
  // 기간을 수정하면(연장 등) 새로 기간에 들어온 근무자를 다시 분류
  if (res.success && res.data) await classifyStaffByPopupSchedule(id);
  return res;
}

// ── Popup Closed Days (휴무일) ────────────────────────────────────────────────
// 운영 기간 안이지만 영업하지 않는 날. 행이 있으면 휴무, 없으면 영업 — 판정 규칙은
// lib/closedDays.ts가 유일한 기준이다.
//
// 휴무일 지정은 급여를 바꾸지 않는다. 이미 배정이 찍힌 날을 휴무로 지정해도 배정 행은 그대로
// 남으며, 지우려면 관리자가 건수를 보고 clearPopupAssignmentsOnDates(roster.ts)를 따로 실행해야 한다.

const ClosedDaySchema = z.object({
  popupId: z.number().int().positive(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다')).min(1, '날짜를 선택하세요'),
  reason: z.string().max(100).nullable(),
});

/**
 * 휴무일 조회 — 팝업 id 목록(비면 전체)과 날짜 범위로 좁힌다.
 * 근무표·일정표·내 일정이 모두 쓰는 읽기라 역할 제한 없이 로그인만 요구한다
 * (휴무일 자체는 "그날 가게가 쉰다"는 사실뿐이라 민감 정보가 아니다).
 */
export async function fetchPopupClosedDays(
  popupIds?: number[],
  fromDate?: string,
  toDate?: string,
): Promise<ApiResponse<PopupClosedDay[]>> {
  return wrap(async () => {
    await requireAuth();
    let q = supabaseAdmin.from('popup_closed_days').select('*').order('closed_date');
    // 빈 배열을 .in()에 그대로 넘기면 항상 0건이 되므로 "전체 조회"와 구분한다
    if (popupIds && popupIds.length > 0) q = q.in('popup_id', popupIds);
    if (fromDate) q = q.gte('closed_date', fromDate);
    if (toDate) q = q.lte('closed_date', toDate);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as PopupClosedDay[];
  });
}

/** 휴무일 지정 (여러 날짜 한 번에 — "매주 ○요일" 일괄 지정용). 이미 휴무인 날은 건너뛴다 */
export async function addPopupClosedDays(
  popupId: number,
  dates: string[],
  reason: string | null,
): Promise<ApiResponse<{ added: PopupClosedDay[]; skipped: number }>> {
  const parsed = ClosedDaySchema.safeParse({ popupId, dates, reason: reason?.trim() || null });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(async () => {
    await requireAdmin();
    const rows = parsed.data.dates.map(d => ({ popup_id: parsed.data.popupId, closed_date: d, reason: parsed.data.reason }));
    // ignoreDuplicates — 이미 휴무로 지정된 날의 사유를 덮어쓰지 않는다 ("매주 월요일"을 다시
    // 눌렀을 때 손으로 적어둔 "명절 휴점" 같은 사유가 조용히 날아가면 안 된다)
    const { data, error } = await supabaseAdmin
      .from('popup_closed_days')
      .upsert(rows, { onConflict: 'popup_id,closed_date', ignoreDuplicates: true })
      .select('*');
    if (error) throw new Error(error.message);
    const added = (data ?? []) as PopupClosedDay[];
    return { added, skipped: rows.length - added.length };
  });
}

/** 휴무일 해제 — 휴점일에 특별 영업을 하는 예외도 있어 날짜 단위로 되돌릴 수 있어야 한다 */
export async function removePopupClosedDay(popupId: number, date: string): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin();
    const { error } = await supabaseAdmin
      .from('popup_closed_days')
      .delete()
      .eq('popup_id', popupId)
      .eq('closed_date', date);
    if (error) throw new Error(error.message);
  });
}
