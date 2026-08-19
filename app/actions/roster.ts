'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { ApiResponse } from '@/types/api'
import type { RosterShift, RosterShiftRequirement, RosterAssignment, StaffProfile, StaffRole } from '@/types/database'
import { getWeekStart, DAY_NAMES, requiredFor } from '@/lib/staffing'
import { paidMinutes, shiftRawMinutes, minutesToHours, DEFAULT_BREAK_MINUTES } from '@/lib/workhours'
import { parseDate, toDateStr, addDays, dayGroup, kstToday, kstYearMonth, ymdToDateStr, monthEndDateStr } from '@/lib/date'
import { getAuthUser, wrap, requireAuth, requireAdmin, requireManagerOrAdmin } from './_base'
import { ASSIGNMENT_COLUMNS, SNAPSHOT_COLUMNS, DEFAULT_SHIFTS, shiftNamePriority, applyUnitFilter, castAssignment, castAssignments } from '@/lib/roster/query-helpers'
import type { InsertRow, GreedyCtx } from '@/lib/roster/autofill'
import { scoreInserts, shuffleStaff, runGreedy } from '@/lib/roster/autofill'

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
}

export interface RosterUndoPayload {
  deleted: RosterAssignmentSnapshot[]
  updated: { id: number; shift_id?: number; staff_id?: number; start_time?: string | null; end_time?: string | null }[]
}

export interface AutoFillLogEntry {
  date: string
  shiftName: string
  names: string[]
}

export interface AutoFillResult {
  added: number
  holes: { date: string; shiftName: string; missing: number }[]
  log: AutoFillLogEntry[]
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

export interface DailyDigestShift {
  shiftName: string
  startTime: string
  endTime: string
  names: string[]
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

/** 새 팝업 생성 시 1회 호출 — 오전/오후 기본 파트를 그 팝업의 실제 운영 기간(active_from/to)에 맞춰 생성 */
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
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .insert([{ work_date: workDate, shift_id: shiftId, staff_id: staffId, staff_role: unit.staffRole, popup_id: unit.popupId }])
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
    if (fromShiftId === toShiftId) throw new Error('같은 파트로는 이동할 수 없습니다.')
    // 원본 배정과 대상 파트의 기존 배정을 함께 조회 — 같은 날 대상 파트에 이미 있으면 unique 충돌
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, start_time, end_time'),
      unit,
    )
      .eq('staff_id', staffId)
      .in('shift_id', [fromShiftId, toShiftId])
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id: number; work_date: string; shift_id: number; start_time: string | null; end_time: string | null }[]
    const targetDates = new Set(rows.filter(r => r.shift_id === toShiftId).map(r => r.work_date))
    const source = rows.filter(r => r.shift_id === fromShiftId)
    const toMove = source.filter(r => !targetDates.has(r.work_date))
    const toMerge = source.filter(r => targetDates.has(r.work_date))

    if (toMove.length > 0) {
      // 개별 시간 오버라이드는 이전 파트 기준 시간이므로 파트 기본 시간으로 리셋
      const { error: moveError } = await supabaseAdmin
        .from('roster_assignments')
        .update({ shift_id: toShiftId, start_time: null, end_time: null })
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
        start_time: r.start_time, end_time: r.end_time,
      })),
      updated: toMove.map(r => ({ id: r.id, shift_id: fromShiftId, start_time: r.start_time, end_time: r.end_time })),
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

/**
 * 빈 자리 자동 배정 (fromDate~toDate, 양끝 포함). 단위(주방/팝업)별로 독립 동작.
 * - 해당 단위의 확정(confirmed) 직원만 대상
 * - 파트/요일/가용기간 조건이 모두 맞는 직원만 배정
 * - 같은 날 여러 파트 중복 배정 금지
 * - 주 최대 근무일(max_days_per_week) 초과 배정 금지 (주 = 일~토, 달력 표시 기준)
 * - 기간 내 근무일이 적은 직원부터 우선 배정해 균등하게 분배
 */
export async function autoFillRoster(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<AutoFillResult>> {
  return wrap(async () => {
    await requireAdmin()
    const shiftsRes = await fetchRosterShifts(unit)
    if (!shiftsRes.success || !shiftsRes.data) throw new Error(shiftsRes.error ?? '파트를 불러올 수 없습니다.')
    const shifts = shiftsRes.data
    const shiftIds = shifts.map(s => s.id)

    const weekFrom = getWeekStart(fromDate)
    const weekTo = addDays(getWeekStart(toDate), 6)
    // 자동배정 알고리즘(lib/roster/autofill.ts)이 실제 쓰는 컬럼만 select — available_ranges(jsonb) 등 불필요한 컬럼 제외
    const staffQuery = supabaseAdmin
      .from('staff_profiles')
      .select('id, name, max_days_per_week, preferred_shift_ids, preferred_days, available_ranges')
      .eq('status', 'confirmed')
      .eq('staff_role', unit.staffRole)
    const [staffRes, assignRes, reqRes] = await Promise.all([
      unit.popupId === null ? staffQuery.is('popup_id', null) : staffQuery.eq('popup_id', unit.popupId),
      applyUnitFilter(
        supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, staff_id, start_time, end_time'),
        unit,
      )
        .gte('work_date', weekFrom)
        .lte('work_date', weekTo),
      supabaseAdmin
        .from('roster_shift_requirements')
        .select('*')
        .in('shift_id', shiftIds)
        .gte('work_date', fromDate)
        .lte('work_date', toDate),
    ])
    if (staffRes.error) throw new Error(staffRes.error.message)
    if (assignRes.error) throw new Error(assignRes.error.message)
    if (reqRes.error) throw new Error(reqRes.error.message)

    const staff = (staffRes.data ?? []) as StaffProfile[]
    const overrides = Object.fromEntries((reqRes.data ?? []).map(q => [`${q.work_date}|${q.shift_id}`, q.required as number]))

    // 캘린더 화면(RosterCalendar)이 쓰는 requiredFor와 동일 규칙 — 기간 무제한 파트는 override 없는 날짜에 자동 배정하지 않는다
    const getRequired = (dateStr: string, shift: RosterShift): number => requiredFor(dateStr, shift, overrides)

    const shiftById = new Map(shifts.map(s => [s.id, s]))
    const filledCount = new Map<string, number>()         // `${date}|${shift_id}` → 배정 수
    const assignedByDate = new Map<string, Set<number>>() // date → 그날 배정된 staff_id
    const workload = new Map<number, number>()             // staff_id → 기간 내 근무일 수
    const weeklyCount = new Map<string, number>()          // `${staff_id}|${주 시작일}` → 주 근무일 수
    const groupLoad = new Map<string, number>()            // `${staff_id}|${그룹}` → 목금토/일월화수 그룹 내 근무일 수
    const staffEndByDate = new Map<string, string>()       // `${date}|${staff_id}` → 퇴근 시간(HH:MM)
    for (const a of assignRes.data ?? []) {
      filledCount.set(`${a.work_date}|${a.shift_id}`, (filledCount.get(`${a.work_date}|${a.shift_id}`) ?? 0) + 1)
      if (!assignedByDate.has(a.work_date)) assignedByDate.set(a.work_date, new Set())
      assignedByDate.get(a.work_date)!.add(a.staff_id)
      workload.set(a.staff_id, (workload.get(a.staff_id) ?? 0) + 1)
      weeklyCount.set(`${a.staff_id}|${getWeekStart(a.work_date)}`, (weeklyCount.get(`${a.staff_id}|${getWeekStart(a.work_date)}`) ?? 0) + 1)
      const grpKey = `${a.staff_id}|${dayGroup(a.work_date)}`
      groupLoad.set(grpKey, (groupLoad.get(grpKey) ?? 0) + 1)
      // 실제 퇴근 시각 — 개별 시간 오버라이드가 있으면 그 값이 진짜 퇴근 시각이다 (findRosterViolations와 동일 규칙)
      const sh = shiftById.get(a.shift_id)
      if (sh) staffEndByDate.set(`${a.work_date}|${a.staff_id}`, a.end_time ?? sh.end_time)
    }

    const dates: string[] = []
    for (const cur = parseDate(fromDate), end = parseDate(toDate); cur <= end; cur.setDate(cur.getDate() + 1))
      dates.push(toDateStr(cur))

    const existingAssignments = (assignRes.data ?? []) as { work_date: string; staff_id: number }[]
    const ctx: GreedyCtx = {
      dates, shifts, shiftById, getRequired,
      filledCount, assignedByDate, workload, weeklyCount, groupLoad, staffEndByDate,
      unit,
    }

    // 12개 후보 생성 → 연속성 점수 최저 채택
    const CANDIDATES = 12
    let bestInserts: InsertRow[] = []
    let bestHoles: AutoFillResult['holes'] = []
    let bestLog: AutoFillLogEntry[] = []
    let bestScore = Infinity

    for (let trial = 0; trial < CANDIDATES; trial++) {
      const staffList = trial === 0 ? [...staff] : shuffleStaff(staff, trial)
      const candidate = runGreedy(staffList, ctx)
      const score = scoreInserts(candidate.inserts, existingAssignments, fromDate, toDate)
      if (score < bestScore) {
        bestScore = score
        bestInserts = candidate.inserts
        bestHoles = candidate.holes
        bestLog = candidate.log
        if (bestScore === 0) break // 고립 근무일 없음 — 이보다 좋은 결과 없으므로 조기종료
      }
    }

    if (bestInserts.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('roster_assignments').insert(bestInserts)
      if (insertError) throw new Error(insertError.message)
    }

    return { added: bestInserts.length, holes: bestHoles, log: bestLog }
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
    if (dates.length === 0) return { added: 0, skipped: 0 }
    const inserts = dates.map(date => ({
      work_date: date,
      shift_id: shiftId,
      staff_id: staffId,
      staff_role: unit.staffRole,
      popup_id: unit.popupId,
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
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('work_date, shift_id, staff_id, start_time, end_time'),
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

// 내일(KST) 배정 현황 — 디스코드 일일 근무 안내용
export async function fetchTomorrowRosterDigest(): Promise<{ dateLabel: string; shifts: DailyDigestShift[] }> {
  const tomorrow = addDays(kstToday(), 1)
  const d = parseDate(tomorrow)
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일(${DAY_NAMES[d.getDay()]})`

  const { data: assignData } = await supabaseAdmin
    .from('roster_assignments')
    .select('start_time, end_time, roster_shifts!roster_assignments_shift_id_fkey (name, start_time, end_time, sort_order), staff_profiles (name)')
    .eq('work_date', tomorrow)
  if (!assignData?.length) return { dateLabel, shifts: [] }

  const grouped = new Map<string, { startTime: string; endTime: string; sortOrder: number; priority: number; names: string[] }>()
  type TomorrowAssignRow = {
    start_time: string | null
    end_time: string | null
    roster_shifts: { name: string; start_time: string; end_time: string; sort_order: number } | null
    staff_profiles: { name: string } | null
  }
  for (const a of assignData as unknown as TomorrowAssignRow[]) {
    const shift = a.roster_shifts
    const name = shift?.name ?? '근무'
    if (!grouped.has(name)) {
      grouped.set(name, {
        startTime: a.start_time ?? shift?.start_time ?? '00:00',
        endTime: a.end_time ?? shift?.end_time ?? '00:00',
        sortOrder: shift?.sort_order ?? 99,
        priority: shiftNamePriority(name),
        names: [],
      })
    }
    grouped.get(name)!.names.push(a.staff_profiles?.name ?? '')
  }

  const shifts = Array.from(grouped.entries())
    .sort(([, a], [, b]) => a.priority !== b.priority ? a.priority - b.priority : a.sortOrder - b.sortOrder)
    .map(([shiftName, g]) => ({ shiftName, startTime: g.startTime, endTime: g.endTime, names: g.names }))

  return { dateLabel, shifts }
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
        : shiftNamePriority(a.shift_name) !== shiftNamePriority(b.shift_name)
        ? shiftNamePriority(a.shift_name) - shiftNamePriority(b.shift_name)
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
    .select('work_date, start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey (name, start_time, end_time)')
    .eq('staff_id', staffId)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date')
  if (assignError) throw new Error(assignError.message)

  const shifts: MyShift[] = (assignData ?? []).map(a => {
    const shift = a.roster_shifts as unknown as { name: string; start_time: string; end_time: string } | null
    const start = a.start_time ?? shift?.start_time ?? '00:00'
    const end = a.end_time ?? shift?.end_time ?? '00:00'
    return {
      work_date: a.work_date,
      shift_name: shift?.name ?? '근무',
      start_time: start,
      end_time: end,
      hours: minutesToHours(shiftRawMinutes(start, end)),
      breakMinutes: a.break_minutes ?? DEFAULT_BREAK_MINUTES,
      netHours: minutesToHours(paidMinutes(start, end, a.break_minutes)),
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
