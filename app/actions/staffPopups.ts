'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { wrap } from './_base'
import { STAFF_COLUMNS } from '@/lib/staff-columns'
import type { ApiResponse } from '@/types/api'
import type { StaffPopupAssignment, StaffProfile } from '@/types/database'

/** 전체 직원↔팝업 배정 매핑 — HR 부트스트랩에서 한 번에 프리페치, 클라이언트에서 Map으로 가공 */
export async function fetchStaffPopupAssignments(): Promise<ApiResponse<StaffPopupAssignment[]>> {
  return wrap(async () => {
    const { data, error } = await supabaseAdmin
      .from('staff_popup_assignments')
      .select('id, staff_id, popup_id, created_at')
    if (error) throw new Error(error.message)
    return (data ?? []) as StaffPopupAssignment[]
  })
}

/** 단일 배정 — 팝업이 선택된 상태에서 신규 직원 등록 시 자동 호출. 이미 배정돼 있으면(ignoreDuplicates) 조용히 무시 */
export async function assignStaffToPopup(staffId: number, popupId: number): Promise<ApiResponse<{ added: number }>> {
  return wrap(async () => {
    const { data, error } = await supabaseAdmin
      .from('staff_popup_assignments')
      .upsert([{ staff_id: staffId, popup_id: popupId }], { onConflict: 'staff_id,popup_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    return { added: (data ?? []).length }
  })
}

/** 일괄 배정 — "기존 근무자 추가" 확인 시 호출 */
export async function bulkAssignStaffToPopup(staffIds: number[], popupId: number): Promise<ApiResponse<{ added: number; skipped: number }>> {
  if (staffIds.length === 0) return { success: true, data: { added: 0, skipped: 0 } }
  return wrap(async () => {
    const { data, error } = await supabaseAdmin
      .from('staff_popup_assignments')
      .upsert(staffIds.map(staffId => ({ staff_id: staffId, popup_id: popupId })), { onConflict: 'staff_id,popup_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    const added = (data ?? []).length
    return { added, skipped: staffIds.length - added }
  })
}

/** 배정 해제 — 오배정 정정용. staff_profiles 자체는 건드리지 않는다 */
export async function unassignStaffFromPopup(staffId: number, popupId: number): Promise<ApiResponse> {
  return wrap(async () => {
    const { error } = await supabaseAdmin
      .from('staff_popup_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('popup_id', popupId)
    if (error) throw new Error(error.message)
  })
}

/**
 * 팝업 기간 기반 자동 분류 — 이 팝업에 배정된 캐셔(roster_assignments.popup_id로 직접 확정)와,
 * 팝업 기간 중 근무한 주방 직원(주방은 특정 팝업에 속하지 않으므로 popup_id가 항상 null이라
 * 날짜 범위로만 판단)을 이 팝업에 자동 배정한다. 이미 배정된 직원은 upsert ignoreDuplicates로
 * 조용히 건너뛴다 — 여러 번 실행해도 안전.
 */
export async function classifyStaffByPopupSchedule(popupId: number): Promise<ApiResponse<{ added: number }>> {
  return wrap(async () => {
    const { data: popup, error: popupError } = await supabaseAdmin
      .from('popup_events')
      .select('id, start_date, end_date')
      .eq('id', popupId)
      .maybeSingle()
    if (popupError) throw new Error(popupError.message)
    if (!popup) throw new Error('팝업을 찾을 수 없습니다.')

    const [cashierRes, kitchenRes] = await Promise.all([
      supabaseAdmin.from('roster_assignments').select('staff_id').eq('popup_id', popupId),
      supabaseAdmin.from('roster_assignments').select('staff_id')
        .eq('staff_role', 'kitchen')
        .gte('work_date', popup.start_date)
        .lte('work_date', popup.end_date),
    ])
    if (cashierRes.error) throw new Error(cashierRes.error.message)
    if (kitchenRes.error) throw new Error(kitchenRes.error.message)

    const staffIds = [...new Set([...(cashierRes.data ?? []), ...(kitchenRes.data ?? [])].map(a => a.staff_id))]
    if (staffIds.length === 0) return { added: 0 }

    const { data, error } = await supabaseAdmin
      .from('staff_popup_assignments')
      .upsert(staffIds.map(staffId => ({ staff_id: staffId, popup_id: popupId })), { onConflict: 'staff_id,popup_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    return { added: (data ?? []).length }
  })
}

/** "기존 근무자 추가" 후보 — 전체 직원 중 targetPopupId에 아직 배정되지 않은 사람 (다른 팝업 이력 여부는 무관) */
export async function fetchImportCandidates(targetPopupId: number): Promise<ApiResponse<StaffProfile[]>> {
  return wrap(async () => {
    const [targetRes, staffRes] = await Promise.all([
      supabaseAdmin.from('staff_popup_assignments').select('staff_id').eq('popup_id', targetPopupId),
      supabaseAdmin.from('staff_profiles').select(STAFF_COLUMNS).order('sort_order'),
    ])
    if (targetRes.error) throw new Error(targetRes.error.message)
    if (staffRes.error) throw new Error(staffRes.error.message)

    const alreadyOnTarget = new Set((targetRes.data ?? []).map(r => r.staff_id))
    return ((staffRes.data ?? []) as StaffProfile[]).filter(s => !alreadyOnTarget.has(s.id))
  })
}
