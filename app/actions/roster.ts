'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { ApiResponse } from '@/types/api'
import type { RosterShift, RosterShiftRequirement, RosterAssignment, StaffRole } from '@/types/database'
import { paidMinutes, shiftRawMinutes, minutesToHours, resolveBreakMinutes } from '@/lib/workhours'
import { addDays, kstToday, kstYearMonth, ymdToDateStr, monthEndDateStr } from '@/lib/date'
import { wrap, requireAuth, requireAdmin, requireManagerOrAdmin } from './_base'
import { ASSIGNMENT_COLUMNS, SNAPSHOT_COLUMNS, DEFAULT_SHIFTS, shiftStartPriority, applyUnitFilter, castAssignment, castAssignments, isAllPopups, materializeFromShift } from '@/lib/roster/query-helpers'

// 스케줄 단위(unit) = 주방 전체(popupId null) 또는 캐셔의 특정 팝업
export interface RosterUnit {
  staffRole: StaffRole
  popupId: number | null
}

export interface RosterShiftInput {
  name: string
  start_time: string
  end_time: string
  weekday_required: number
  weekend_required: number
  active_from?: string | null
  active_to?: string | null
  break_minutes: number
}

export interface RosterMonthData {
  shifts: RosterShift[]
  assignments: RosterAssignment[]
  requirements: RosterShiftRequirement[]
}

// 되돌리기용 스냅샷 — 삭제 행 재삽입과 수정 행 원복에 필요한 최소 필드
export interface RosterAssignmentSnapshot {
  work_date: string
  shift_id: number
  staff_id: number
  staff_role: StaffRole
  popup_id: number | null
  start_time: string | null
  end_time: string | null
  break_minutes: number | null
}

export interface RosterUndoPayload {
  deleted: RosterAssignmentSnapshot[]
  updated: { id: number; shift_id?: number; staff_id?: number; start_time?: string | null; end_time?: string | null; break_minutes?: number | null }[]
}

export interface MyShift {
  work_date: string
  shift_name: string
  start_time: string
  end_time: string
  hours: number
  breakMinutes: number
  netHours: number
}

export interface MyRosterData {
  shifts: MyShift[] // 이번 달 1일 ~ 다음 달 말일
}

export interface WeeklyRosterEntry {
  work_date: string
  shift_name: string
  name: string
  phone: string | null
  start_time: string
  end_time: string
}

// 역할 검사 없는 내부 구현 — 반드시 requireAdmin()/requireManagerOrAdmin()으로 감싼 exported 함수를 통해서만 호출할 것.
// 이 함수 자체를 export하면 role 검사 없는 새 서버 액션(공개 POST 엔드포인트)이 생기므로 절대 export 금지.
async function fetchRosterShiftsUnchecked(unit: RosterUnit): Promise<RosterShift[]> {
  const { data, error } = await applyUnitFilter(
    supabaseAdmin.from('roster_shifts').select('*'),
    unit,
  )
    .order('sort_order')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as RosterShift[]
}

/** 단위의 파트 목록 — 조회는 순수 읽기다. 없으면 빈 배열을 반환하며, 기본 파트 생성은 팝업 생성 시점(createDefaultCashierShifts)에서만 이뤄진다 */
export async function fetchRosterShifts(unit: RosterUnit): Promise<ApiResponse<RosterShift[]>> {
  return wrap(async () => {
    await requireAdmin()
    return fetchRosterShiftsUnchecked(unit)
  })
}

/** 새 팝업 생성 시 1회 호출 — 하루 전체(00:00~24:00) 기본 파트 하나를 그 팝업의 실제 운영 기간(active_from/to)에 맞춰 생성 */
export async function createDefaultCashierShifts(popupId: number, startDate: string, endDate: string): Promise<ApiResponse<RosterShift[]>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .insert(DEFAULT_SHIFTS.map(s => ({ ...s, staff_role: 'cashier' as const, popup_id: popupId, active_from: startDate, active_to: endDate })))
      .select('*')
    if (error) throw new Error(error.message)
    return (data ?? []) as RosterShift[]
  })
}

/** 전체 파트 목록 (직원 카드의 선호 파트 이름 표시용) */
export async function fetchAllRosterShifts(): Promise<ApiResponse<RosterShift[]>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .select('*')
      .order('sort_order')
      .order('created_at')
    if (error) throw new Error(error.message)
    return (data ?? []) as RosterShift[]
  })
}

export async function createRosterShift(unit: RosterUnit, input: RosterShiftInput): Promise<ApiResponse<RosterShift>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 새 파트를 만들 수 없습니다. 팝업을 선택하세요.')
    if (!input.name.trim()) throw new Error('파트 이름을 입력하세요.')
    const { count } = await applyUnitFilter(
      supabaseAdmin.from('roster_shifts').select('*', { count: 'exact', head: true }),
      unit,
    )
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .insert([{ ...input, name: input.name.trim(), staff_role: unit.staffRole, popup_id: unit.popupId, sort_order: count ?? 0 }])
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RosterShift
  })
}

export async function updateRosterShift(id: number, input: RosterShiftInput): Promise<ApiResponse<RosterShift>> {
  return wrap(async () => {
    await requireAdmin()
    if (!input.name.trim()) throw new Error('파트 이름을 입력하세요.')
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .update({ ...input, name: input.name.trim() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RosterShift
  })
}

export async function updateRosterShiftOrder(updates: { id: number; sort_order: number }[]): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin()
    await Promise.all(
      updates.map(u => supabaseAdmin.from('roster_shifts').update({ sort_order: u.sort_order }).eq('id', u.id))
    )
  })
}

/** 파트 삭제 — 이 파트의 배정/날짜별 예외도 함께 삭제된다 */
export async function deleteRosterShift(id: number): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin()
    const { error } = await supabaseAdmin.from('roster_shifts').delete().eq('id', id)
    if (error) throw new Error(error.message)
  })
}

// 역할 검사 없는 내부 구현 — 위 fetchRosterShiftsUnchecked와 동일한 이유로 export 금지.
async function fetchRosterRangeUnchecked(unit: RosterUnit, fromDate: string, toDate: string): Promise<RosterMonthData> {
  // 배정 조회는 파트 목록과 독립이므로 병렬 실행 — 날짜별 요구 인원 예외만 파트 id에 의존
  const [shifts, assignRes] = await Promise.all([
    fetchRosterShiftsUnchecked(unit),
    applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select(ASSIGNMENT_COLUMNS),
      unit,
    )
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
      .order('work_date'),
  ])
  if (assignRes.error) throw new Error(assignRes.error.message)
  const shiftIds = shifts.map(s => s.id)

  const reqRes = shiftIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin
        .from('roster_shift_requirements')
        .select('*')
        .in('shift_id', shiftIds)
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
  if (reqRes.error) throw new Error(reqRes.error.message)
  return {
    shifts,
    assignments: castAssignments(assignRes.data),
    requirements: (reqRes.data ?? []) as RosterShiftRequirement[],
  }
}

/** fromDate/toDate: YYYY-MM-DD (양끝 포함). 파트 목록 + 배정 + 날짜별 예외를 한 번에. 어드민 전용(HR 탭 편집 화면). */
export async function fetchRosterRange(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<RosterMonthData>> {
  return wrap(async () => {
    await requireAdmin()
    return fetchRosterRangeUnchecked(unit, fromDate, toDate)
  })
}

/** fetchRosterRange의 매니저 허용 버전 — roster-view.ts의 일정표(읽기 전용) 화면 전용. admin·manager 둘 다 허용. */
export async function fetchRosterRangeForOverview(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<RosterMonthData>> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    return fetchRosterRangeUnchecked(unit, fromDate, toDate)
  })
}

export async function addRosterAssignment(
  unit: RosterUnit,
  workDate: string,
  shiftId: number,
  staffId: number,
): Promise<ApiResponse<RosterAssignment>> {
  return wrap(async () => {
    await requireAdmin()
    // popup_id는 unit이 아니라 실제 파트(shift)에서 가져온다 — 캐셔 달력 "전체" 보기(unit.popupId가 실제
    // 팝업이 아닌 ALL_POPUPS 센티널)에서도 그 파트가 속한 진짜 팝업으로 정확히 저장되게 하기 위함.
    // 일반 모드에서는 shift.popup_id === unit.popupId라 동작이 그대로다.
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from('roster_shifts')
      .select('popup_id, start_time, end_time, break_minutes')
      .eq('id', shiftId)
      .single()
    if (shiftError || !shift) throw new Error('파트 정보를 찾을 수 없습니다.')
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .insert([{
        work_date: workDate, shift_id: shiftId, staff_id: staffId,
        staff_role: unit.staffRole, popup_id: shift.popup_id,
        // 파트 시간을 빌려 쓰지 않고 이 근무일의 확정 시간으로 복사해 둔다 — 파트를 나중에 수정·삭제해도
        // 이미 기록된 근로내역이 흔들리지 않는다 (20261006082614 마이그레이션과 같은 기준).
        ...materializeFromShift(shift),
      }])
      .select(ASSIGNMENT_COLUMNS)
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('이미 해당 파트에 배정되어 있습니다.')
      throw new Error(error.message)
    }
    return castAssignment(data)
  })
}

export async function removeRosterAssignment(id: number): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin()
    const { error } = await supabaseAdmin.from('roster_assignments').delete().eq('id', id)
    if (error) throw new Error(error.message)
  })
}

export async function updateRosterAssignmentTime(
  id: number,
  startTime: string | null,
  endTime: string | null,
): Promise<ApiResponse<RosterAssignment>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .update({ start_time: startTime, end_time: endTime })
      .eq('id', id)
      .select(ASSIGNMENT_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    return castAssignment(data)
  })
}

// 근무일별 휴게시간 포함/미포함 오버라이드 — null이면 기본(고정 1시간)으로 되돌림
export async function updateRosterAssignmentBreak(
  id: number,
  breakMinutes: number | null,
): Promise<ApiResponse<RosterAssignment>> {
  return wrap(async () => {
    await requireAdmin()
    // 급여에 직결되는 값 — 음수·소수·하루 초과 값이 들어오면 조용히 저장되지 않도록 차단
    if (breakMinutes != null && (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 24 * 60)) {
      throw new Error('휴게시간은 0~1440 사이의 분 단위 정수여야 합니다.')
    }
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .update({ break_minutes: breakMinutes })
      .eq('id', id)
      .select(ASSIGNMENT_COLUMNS)
      .single()
    if (error) throw new Error(error.message)
    return castAssignment(data)
  })
}

/** 파괴적 작업(초기화·일괄 해제·이동·교환) 되돌리기 — 삭제 행 재삽입 + 수정 행 원복 */
export async function undoRosterChange(payload: RosterUndoPayload): Promise<ApiResponse<{ restored: number }>> {
  return wrap(async () => {
    await requireAdmin()
    let restored = 0
    if (payload.deleted.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('roster_assignments')
        .upsert(payload.deleted, { onConflict: 'work_date,shift_id,staff_id', ignoreDuplicates: true })
        .select('id')
      if (error) throw new Error(error.message)
      restored += (data ?? []).length
    }
    if (payload.updated.length > 0) {
      const results = await Promise.all(
        payload.updated.map(({ id, ...fields }) =>
          supabaseAdmin.from('roster_assignments').update(fields).eq('id', id),
        ),
      )
      const failed = results.find(r => r.error)
      if (failed?.error) throw new Error(failed.error.message)
      restored += payload.updated.length
    }
    return { restored }
  })
}

/** 특정 근무자의 기간 내 배정을 다른 파트로 일괄 이동 — 대상 파트에 이미 배정된 날은 원본만 제거(merge) */
export async function moveStaffAssignments(
  unit: RosterUnit,
  staffId: number,
  fromShiftId: number,
  toShiftId: number,
  fromDate: string,
  toDate: string,
): Promise<ApiResponse<{ moved: number; merged: number; undo: RosterUndoPayload }>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 일괄 편집을 사용할 수 없습니다. 팝업을 선택하세요.')
    if (fromShiftId === toShiftId) throw new Error('같은 파트로는 이동할 수 없습니다.')
    const { data: toShift, error: toShiftError } = await supabaseAdmin
      .from('roster_shifts')
      .select('start_time, end_time, break_minutes')
      .eq('id', toShiftId)
      .single()
    if (toShiftError || !toShift) throw new Error('대상 파트 정보를 찾을 수 없습니다.')
    // 원본 배정과 대상 파트의 기존 배정을 함께 조회 — 같은 날 대상 파트에 이미 있으면 unique 충돌
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, start_time, end_time, break_minutes'),
      unit,
    )
      .eq('staff_id', staffId)
      .in('shift_id', [fromShiftId, toShiftId])
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id: number; work_date: string; shift_id: number; start_time: string | null; end_time: string | null; break_minutes: number | null }[]
    const targetDates = new Set(rows.filter(r => r.shift_id === toShiftId).map(r => r.work_date))
    const source = rows.filter(r => r.shift_id === fromShiftId)
    const toMove = source.filter(r => !targetDates.has(r.work_date))
    const toMerge = source.filter(r => targetDates.has(r.work_date))

    if (toMove.length > 0) {
      // 기존 시간은 이전 파트 기준이므로 대상 파트의 시간·휴게로 바꿔 쓴다.
      // NULL로 비우면 다시 파트 조인에 의존하게 되므로 확정값을 그대로 기록한다.
      const { error: moveError } = await supabaseAdmin
        .from('roster_assignments')
        .update({ shift_id: toShiftId, ...materializeFromShift(toShift) })
        .in('id', toMove.map(r => r.id))
      if (moveError) throw new Error(moveError.message)
    }
    if (toMerge.length > 0) {
      const { error: mergeError } = await supabaseAdmin
        .from('roster_assignments')
        .delete()
        .in('id', toMerge.map(r => r.id))
      if (mergeError) throw new Error(mergeError.message)
    }
    const undo: RosterUndoPayload = {
      deleted: toMerge.map(r => ({
        work_date: r.work_date, shift_id: fromShiftId, staff_id: staffId,
        staff_role: unit.staffRole, popup_id: unit.popupId,
        start_time: r.start_time, end_time: r.end_time, break_minutes: r.break_minutes,
      })),
      updated: toMove.map(r => ({ id: r.id, shift_id: fromShiftId, start_time: r.start_time, end_time: r.end_time, break_minutes: r.break_minutes })),
    }
    return { moved: toMove.length, merged: toMerge.length, undo }
  })
}

/** 특정 근무자의 기간 내 배정 일괄 해제 — shiftId를 주면 해당 파트만 */
export async function clearStaffAssignments(
  unit: RosterUnit,
  staffId: number,
  fromDate: string,
  toDate: string,
  shiftId: number | null,
): Promise<ApiResponse<{ removed: number; undo: RosterUndoPayload }>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 일괄 편집을 사용할 수 없습니다. 팝업을 선택하세요.')
    let q = applyUnitFilter(
      supabaseAdmin.from('roster_assignments').delete(),
      unit,
    )
      .eq('staff_id', staffId)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (shiftId !== null) q = q.eq('shift_id', shiftId)
    const { data, error } = await q.select(SNAPSHOT_COLUMNS)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as RosterAssignmentSnapshot[]
    return { removed: rows.length, undo: { deleted: rows, updated: [] } }
  })
}

/** 두 근무자의 기간 내 배정을 서로 교환 — 같은 날 같은 파트에 둘 다 배정된 슬롯은 교환해도 동일하므로 제외 */
export async function swapStaffAssignments(
  unit: RosterUnit,
  staffAId: number,
  staffBId: number,
  fromDate: string,
  toDate: string,
): Promise<ApiResponse<{ swapped: number; undo: RosterUndoPayload }>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 일괄 편집을 사용할 수 없습니다. 팝업을 선택하세요.')
    if (staffAId === staffBId) throw new Error('서로 다른 근무자를 선택하세요.')
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, staff_id'),
      unit,
    )
      .in('staff_id', [staffAId, staffBId])
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id: number; work_date: string; shift_id: number; staff_id: number }[]
    const slotKey = (r: { work_date: string; shift_id: number }) => `${r.work_date}|${r.shift_id}`
    const aKeys = new Set(rows.filter(r => r.staff_id === staffAId).map(slotKey))
    const bKeys = new Set(rows.filter(r => r.staff_id === staffBId).map(slotKey))
    const aRows = rows.filter(r => r.staff_id === staffAId && !bKeys.has(slotKey(r)))
    const bRows = rows.filter(r => r.staff_id === staffBId && !aKeys.has(slotKey(r)))
    if (aRows.length + bRows.length === 0) return { swapped: 0, undo: { deleted: [], updated: [] } }

    if (aRows.length > 0) {
      const { error: aError } = await supabaseAdmin
        .from('roster_assignments')
        .update({ staff_id: staffBId })
        .in('id', aRows.map(r => r.id))
      if (aError) throw new Error(aError.message)
    }
    if (bRows.length > 0) {
      const { error: bError } = await supabaseAdmin
        .from('roster_assignments')
        .update({ staff_id: staffAId })
        .in('id', bRows.map(r => r.id))
      if (bError) throw new Error(bError.message)
    }
    const undo: RosterUndoPayload = {
      deleted: [],
      updated: [
        ...aRows.map(r => ({ id: r.id, staff_id: staffAId })),
        ...bRows.map(r => ({ id: r.id, staff_id: staffBId })),
      ],
    }
    return { swapped: aRows.length + bRows.length, undo }
  })
}

export async function setShiftRequirement(
  workDate: string,
  shiftId: number,
  required: number,
): Promise<ApiResponse<RosterShiftRequirement>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('roster_shift_requirements')
      .upsert([{ work_date: workDate, shift_id: shiftId, required }], { onConflict: 'work_date,shift_id' })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as RosterShiftRequirement
  })
}

/** 날짜별 예외를 제거하고 파트 기본값으로 되돌린다 */
export async function clearShiftRequirement(workDate: string, shiftId: number): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin()
    const { error } = await supabaseAdmin
      .from('roster_shift_requirements')
      .delete()
      .eq('work_date', workDate)
      .eq('shift_id', shiftId)
    if (error) throw new Error(error.message)
  })
}

export async function bulkAddRosterAssignments(
  unit: RosterUnit,
  shiftId: number,
  staffId: number,
  dates: string[],
): Promise<ApiResponse<{ added: number; skipped: number }>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 일괄 배정을 사용할 수 없습니다. 팝업을 선택하세요.')
    if (dates.length === 0) return { added: 0, skipped: 0 }
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from('roster_shifts')
      .select('start_time, end_time, break_minutes')
      .eq('id', shiftId)
      .single()
    if (shiftError || !shift) throw new Error('파트 정보를 찾을 수 없습니다.')
    const materialized = materializeFromShift(shift)
    const inserts = dates.map(date => ({
      work_date: date,
      shift_id: shiftId,
      staff_id: staffId,
      staff_role: unit.staffRole,
      popup_id: unit.popupId,
      ...materialized,
    }))
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .upsert(inserts, { onConflict: 'work_date,shift_id,staff_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    const added = (data ?? []).length
    return { added, skipped: dates.length - added }
  })
}

/** 직전 주(일~토) 배정을 대상 주의 같은 요일로 복사 — 이미 있는 배정·지난 날짜는 건너뜀 */
export async function copyPreviousWeek(
  unit: RosterUnit,
  weekStart: string, // 대상 주의 일요일 (YYYY-MM-DD)
): Promise<ApiResponse<{ added: number; skipped: number }>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 지난주 복사를 사용할 수 없습니다. 팝업을 선택하세요.')
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('work_date, shift_id, staff_id, start_time, end_time, break_minutes'),
      unit,
    )
      .gte('work_date', addDays(weekStart, -7))
      .lte('work_date', addDays(weekStart, -1))
    if (error) throw new Error(error.message)

    const today = kstToday()
    const candidates = (data ?? [])
      .map(a => ({
        work_date: addDays(a.work_date, 7),
        shift_id: a.shift_id,
        staff_id: a.staff_id,
        staff_role: unit.staffRole,
        popup_id: unit.popupId,
        start_time: a.start_time,
        end_time: a.end_time,
        // 휴게 오버라이드도 함께 복사한다 — 빠뜨리면 복사된 주만 기본 휴게로 계산돼 급여가 어긋났다
        break_minutes: a.break_minutes,
      }))
      .filter(r => r.work_date >= today)
    if (candidates.length === 0) return { added: 0, skipped: 0 }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('roster_assignments')
      .upsert(candidates, { onConflict: 'work_date,shift_id,staff_id', ignoreDuplicates: true })
      .select('id')
    if (insertError) throw new Error(insertError.message)
    const added = (inserted ?? []).length
    return { added, skipped: candidates.length - added }
  })
}

export async function clearRosterRange(
  unit: RosterUnit,
  fromDate: string,
  toDate: string,
): Promise<ApiResponse<{ removed: number; undo: RosterUndoPayload }>> {
  return wrap(async () => {
    await requireAdmin()
    if (isAllPopups(unit)) throw new Error('전체 보기에서는 초기화를 사용할 수 없습니다. 팝업을 선택하세요.')
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').delete(),
      unit,
    )
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
      .select(SNAPSHOT_COLUMNS)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as RosterAssignmentSnapshot[]
    return { removed: rows.length, undo: { deleted: rows, updated: [] } }
  })
}

export async function fetchWeeklyRosterForPrint(from: string, to: string, staffRole?: StaffRole): Promise<ApiResponse<WeeklyRosterEntry[]>> {
  return wrap(async () => {
    await requireAdmin()
    const staffQuery = supabaseAdmin
      .from('staff_profiles')
      .select('id, name, phone, sort_order')
      .eq('status', 'confirmed')
    const { data: staffData, error: staffError } = staffRole
      ? await staffQuery.eq('staff_role', staffRole)
      : await staffQuery
    if (staffError) throw new Error(staffError.message)

    const staffArr = (staffData ?? []) as { id: number; name: string; phone: string | null; sort_order: number }[]
    if (staffArr.length === 0) return []

    const staffMap = new Map(staffArr.map(s => [s.id, s]))

    const { data: assignData, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, start_time, end_time, staff_id, roster_shifts!roster_assignments_shift_id_fkey (name, start_time, end_time, sort_order)')
      .gte('work_date', from)
      .lte('work_date', to)
      .in('staff_id', staffArr.map(s => s.id))
      .order('work_date')
    if (assignError) throw new Error(assignError.message)

    type WeeklyAssignRow = {
      work_date: string
      start_time: string | null
      end_time: string | null
      staff_id: number
      roster_shifts: { name: string; start_time: string; end_time: string; sort_order: number } | null
    }
    const withOrder = ((assignData ?? []) as unknown as WeeklyAssignRow[]).map(a => {
      const shift = a.roster_shifts
      const staff = staffMap.get(a.staff_id)!
      return {
        work_date: a.work_date,
        shift_name: shift?.name ?? '',
        name: staff.name,
        phone: staff.phone,
        start_time: a.start_time ?? shift?.start_time ?? '00:00',
        end_time: a.end_time ?? shift?.end_time ?? '00:00',
        shift_sort_order: shift?.sort_order ?? 99,
        sort_order: staff.sort_order,
      }
    })

    withOrder.sort((a, b) =>
      a.work_date !== b.work_date
        ? a.work_date.localeCompare(b.work_date)
        : shiftStartPriority(a.start_time) !== shiftStartPriority(b.start_time)
        ? shiftStartPriority(a.start_time) - shiftStartPriority(b.start_time)
        : a.shift_sort_order !== b.shift_sort_order
        ? a.shift_sort_order - b.shift_sort_order
        : a.sort_order - b.sort_order
    )

    return withOrder.map(({ sort_order: _s, shift_sort_order: _ss, ...entry }) => entry)
  })
}

// 이번 달 1일 ~ 다음 달 말일 근무 배정을 조회 — 본인/관리자 조회 양쪽에서 공유
// 시급·급여는 여기서 절대 내려보내지 않는다: 이 데이터는 근무자 본인 브라우저까지 가므로 급여 정보는 관리자 화면(payroll)에서만 조회
async function fetchRosterDataForStaff(staffId: number): Promise<MyRosterData> {
  // KST 기준 이번 달 1일 ~ 다음 달 말일
  const { y, m } = kstYearMonth()
  const from = ymdToDateStr(y, m, 1)
  const to = monthEndDateStr(y, m + 1)

  const { data: assignData, error: assignError } = await supabaseAdmin
    .from('roster_assignments')
    .select('work_date, start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey (name, start_time, end_time, break_minutes)')
    .eq('staff_id', staffId)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date')
  if (assignError) throw new Error(assignError.message)

  const shifts: MyShift[] = (assignData ?? []).map(a => {
    const shift = a.roster_shifts as unknown as { name: string; start_time: string; end_time: string; break_minutes: number } | null
    const start = a.start_time ?? shift?.start_time ?? '00:00'
    const end = a.end_time ?? shift?.end_time ?? '00:00'
    return {
      work_date: a.work_date,
      shift_name: shift?.name ?? '근무',
      start_time: start,
      end_time: end,
      hours: minutesToHours(shiftRawMinutes(start, end)),
      breakMinutes: resolveBreakMinutes(a.break_minutes, shift?.break_minutes),
      netHours: minutesToHours(paidMinutes(start, end, a.break_minutes, shift?.break_minutes)),
    }
  })

  return { shifts }
}

/**
 * 로그인한 근무자 본인의 확정 근무 일정.
 * staff_profiles.user_profile_id로 연결된 프로필이 없으면 data: null (섹션 숨김용).
 */
export async function getMyRoster(): Promise<ApiResponse<MyRosterData | null>> {
  return wrap(async () => {
    const user = await requireAuth()

    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_profile_id', user.id)
      .maybeSingle()
    if (staffError) throw new Error(staffError.message)
    if (!staff) return null

    return fetchRosterDataForStaff(staff.id)
  })
}

export interface MyCumulativeHours {
  totalHours: number
  totalDays: number
}

async function fetchCumulativeWorkedHoursForUserProfileId(userProfileId: string): Promise<MyCumulativeHours> {
  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from('staff_profiles')
    .select('id')
    .eq('user_profile_id', userProfileId)
  if (staffError) throw new Error(staffError.message)

  const staffIds = (staffRows ?? []).map(s => s.id)
  if (staffIds.length === 0) return { totalHours: 0, totalDays: 0 }

  // 아직 근무하지 않은 미래 배정까지 누적시간에 잡히면 티어가 미리 올라가버린다 — 오늘까지만 합산
  const { data: assignData, error: assignError } = await supabaseAdmin
    .from('roster_assignments')
    .select('work_date, start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey (start_time, end_time, break_minutes)')
    .in('staff_id', staffIds)
    .lte('work_date', kstToday())
  if (assignError) throw new Error(assignError.message)

  let totalMinutes = 0
  const days = new Set<string>()
  for (const a of assignData ?? []) {
    const shift = a.roster_shifts as unknown as { start_time: string; end_time: string; break_minutes: number } | null
    const start = a.start_time ?? shift?.start_time ?? '00:00'
    const end = a.end_time ?? shift?.end_time ?? '00:00'
    totalMinutes += paidMinutes(start, end, a.break_minutes, shift?.break_minutes)
    days.add(a.work_date)
  }

  return { totalHours: minutesToHours(totalMinutes), totalDays: days.size }
}

/**
 * 로그인한 근무자의 전체 기간 누적 유급 근무시간 — MY 페이지 근무시간 티어용.
 * 한 사람이 여러 팝업에서 일하면 staff_profiles row가 팝업별로 나뉘므로,
 * user_profile_id에 연결된 모든 row를 합산해야 근무시간이 누락되지 않는다.
 */
export async function getMyCumulativeWorkedHours(): Promise<ApiResponse<MyCumulativeHours>> {
  return wrap(async () => {
    const user = await requireAuth()
    return fetchCumulativeWorkedHoursForUserProfileId(user.id)
  })
}

/** 관리자가 MY 페이지에서 다른 근무자의 누적 근무시간을 조회 */
export async function getCumulativeWorkedHoursAsAdmin(userId: string): Promise<ApiResponse<MyCumulativeHours>> {
  return wrap(async () => {
    await requireAdmin()
    return fetchCumulativeWorkedHoursForUserProfileId(userId)
  })
}

export interface WorkerTierRankingRow {
  name: string
  hours: number
}

export interface WorkerTierRankingByRole {
  kitchen: WorkerTierRankingRow[]
  cashier: WorkerTierRankingRow[]
}

/**
 * MY 페이지 근무 티어 랭킹 — 퇴사자 포함 전체 근무자의 누적 유급 근무시간 순위, 주방/캐셔 부문 분리
 * (status 무관 — 후보/불합격은 근무 기록이 없어 어차피 0시간으로 걸러짐).
 * 한 사람이 여러 팝업(staff_profiles row)에서 같은 부문으로 뛰면 user_profile_id 기준으로 합산한다.
 * 부문을 바꿔 뛴 사람(주방+캐셔 row가 다 있는 경우)은 두 랭킹 모두에 각자 시간으로 등장한다.
 */
export async function getWorkerTierRanking(): Promise<ApiResponse<WorkerTierRankingByRole>> {
  return wrap(async () => {
    await requireAuth()

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, name, user_profile_id, staff_role')
    if (staffError) throw new Error(staffError.message)
    if (!staffRows || staffRows.length === 0) return { kitchen: [], cashier: [] }

    const staffIds = staffRows.map(s => s.id)
    // 아직 근무하지 않은 미래 배정까지 잡히면 티어가 미리 올라가버린다 — 오늘까지만 합산
    const { data: assignData, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('staff_id, work_date, start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey (start_time, end_time, break_minutes)')
      .in('staff_id', staffIds)
      .lte('work_date', kstToday())
    if (assignError) throw new Error(assignError.message)

    const minutesByStaffId = new Map<number, number>()
    for (const a of assignData ?? []) {
      const shift = a.roster_shifts as unknown as { start_time: string; end_time: string; break_minutes: number } | null
      const start = a.start_time ?? shift?.start_time ?? '00:00'
      const end = a.end_time ?? shift?.end_time ?? '00:00'
      minutesByStaffId.set(a.staff_id, (minutesByStaffId.get(a.staff_id) ?? 0) + paidMinutes(start, end, a.break_minutes, shift?.break_minutes))
    }

    const buildRanking = (role: 'kitchen' | 'cashier'): WorkerTierRankingRow[] => {
      // 여러 팝업에서 뛰는 사람은 user_profile_id로, 계정이 없는 후보는 staff_id로 묶는다
      const groups = new Map<string, { name: string; minutes: number }>()
      for (const s of staffRows) {
        if (s.staff_role !== role) continue
        const key = s.user_profile_id ?? `staff:${s.id}`
        const minutes = minutesByStaffId.get(s.id) ?? 0
        const existing = groups.get(key)
        if (existing) existing.minutes += minutes
        else groups.set(key, { name: s.name, minutes })
      }

      return Array.from(groups.values())
        .map(g => ({ name: g.name, hours: minutesToHours(g.minutes) }))
        .filter(g => g.hours > 0)
        .sort((a, b) => b.hours - a.hours)
    }

    return { kitchen: buildRanking('kitchen'), cashier: buildRanking('cashier') }
  })
}

/**
 * 관리자가 MY 페이지에서 다른 근무자의 다가오는 근무 일정을 조회 — user_profile_id에 연결된
 * 모든 staff_profiles row(다중 팝업 근무자 포함)의 근무를 날짜순으로 합쳐 반환한다.
 */
export async function getRosterAsAdmin(userId: string): Promise<ApiResponse<MyRosterData>> {
  return wrap(async () => {
    await requireAdmin()

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('user_profile_id', userId)
    if (staffError) throw new Error(staffError.message)

    const staffIds = (staffRows ?? []).map(s => s.id)
    if (staffIds.length === 0) return { shifts: [] }

    const perStaff = await Promise.all(staffIds.map(id => fetchRosterDataForStaff(id)))
    const shifts = perStaff.flatMap(r => r.shifts).sort((a, b) => a.work_date.localeCompare(b.work_date))
    return { shifts }
  })
}

// 관리자/매니저가 '스케줄' 탭에서 다른 직원의 근무표를 유저와 동일한 화면으로 조회 — 일정표(요약 테이블)와 별개로 개인 캘린더 뷰를 그대로 재사용
export async function getStaffRosterAsManager(staffId: number): Promise<ApiResponse<MyRosterData | null>> {
  return wrap(async () => {
    await requireManagerOrAdmin()

    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id')
      .eq('id', staffId)
      .maybeSingle()
    if (staffError) throw new Error(staffError.message)
    if (!staff) return null

    return fetchRosterDataForStaff(staff.id)
  })
}
