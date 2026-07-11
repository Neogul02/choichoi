'use server'

import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { ApiResponse } from '@/types/api'
import type { RosterShift, RosterShiftRequirement, RosterAssignment, StaffProfile, StaffRole } from '@/types/database'
import { checkStaffAvailability, getWeekStart, toMinutes, MIN_REST_MINUTES } from '@/lib/staffing'
import { parseDate, toDateStr, addDays, prevDate, dayOfWeek, dayGroup, kstToday } from '@/lib/date'

// 시프트 이름 고정 우선순위: 오전 → 오후 → 기타
const shiftNamePriority = (name: string) => name === '오전' ? 0 : name === '오후' ? 1 : 2

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ASSIGNMENT_COLUMNS = 'id, work_date, shift_id, staff_id, staff_role, store_id, start_time, end_time, created_at, staff_profiles (id, name, phone, status)'

// 스케줄 단위(unit) = 주방 전체(storeId null) 또는 캐셔의 특정 매장
export interface RosterUnit {
  staffRole: StaffRole
  storeId: number | null
}

// supabase 쿼리 빌더 제네릭을 그대로 제약하면 타입 추론이 폭발(TS2589)해서 내부만 느슨하게 처리
interface UnitFilterable { eq(column: string, value: unknown): unknown; is(column: string, value: null): unknown }
function applyUnitFilter<T>(query: T, unit: RosterUnit): T {
  const q = (query as unknown as UnitFilterable).eq('staff_role', unit.staffRole) as UnitFilterable
  const filtered = unit.storeId === null ? q.is('store_id', null) : q.eq('store_id', unit.storeId)
  return filtered as T
}

const DEFAULT_SHIFTS = [
  { name: '오전', start_time: '06:00', end_time: '15:00', weekday_required: 2, weekend_required: 2, sort_order: 0 },
  { name: '오후', start_time: '15:00', end_time: '22:00', weekday_required: 2, weekend_required: 2, sort_order: 1 },
]

/** 단위의 파트 목록 — 없으면 오전/오후 기본 파트를 생성해서 반환 */
export async function fetchRosterShifts(unit: RosterUnit): Promise<ApiResponse<RosterShift[]>> {
  try {
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_shifts').select('*'),
      unit,
    )
      .order('sort_order')
      .order('created_at')
    if (error) return { success: false, error: error.message }
    if (data && data.length > 0) return { success: true, data: data as RosterShift[] }

    const { data: created, error: createError } = await supabaseAdmin
      .from('roster_shifts')
      .insert(DEFAULT_SHIFTS.map(s => ({ ...s, staff_role: unit.staffRole, store_id: unit.storeId })))
      .select('*')
    if (createError) return { success: false, error: createError.message }
    return { success: true, data: (created ?? []) as RosterShift[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 전체 파트 목록 (직원 카드의 선호 파트 이름 표시용) */
export async function fetchAllRosterShifts(): Promise<ApiResponse<RosterShift[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .select('*')
      .order('sort_order')
      .order('created_at')
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as RosterShift[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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

export async function createRosterShift(unit: RosterUnit, input: RosterShiftInput): Promise<ApiResponse<RosterShift>> {
  try {
    if (!input.name.trim()) return { success: false, error: '파트 이름을 입력하세요.' }
    const { count } = await applyUnitFilter(
      supabaseAdmin.from('roster_shifts').select('*', { count: 'exact', head: true }),
      unit,
    )
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .insert([{ ...input, name: input.name.trim(), staff_role: unit.staffRole, store_id: unit.storeId, sort_order: count ?? 0 }])
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterShift }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateRosterShift(id: number, input: RosterShiftInput): Promise<ApiResponse<RosterShift>> {
  try {
    if (!input.name.trim()) return { success: false, error: '파트 이름을 입력하세요.' }
    const { data, error } = await supabaseAdmin
      .from('roster_shifts')
      .update({ ...input, name: input.name.trim() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterShift }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateRosterShiftOrder(updates: { id: number; sort_order: number }[]): Promise<ApiResponse> {
  try {
    await Promise.all(
      updates.map(u => supabaseAdmin.from('roster_shifts').update({ sort_order: u.sort_order }).eq('id', u.id))
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 파트 삭제 — 이 파트의 배정/날짜별 예외도 함께 삭제된다 */
export async function deleteRosterShift(id: number): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin.from('roster_shifts').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface RosterMonthData {
  shifts: RosterShift[]
  assignments: RosterAssignment[]
  requirements: RosterShiftRequirement[]
}

/** fromDate/toDate: YYYY-MM-DD (양끝 포함). 파트 목록 + 배정 + 날짜별 예외를 한 번에 */
export async function fetchRosterRange(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<RosterMonthData>> {
  try {
    // 배정 조회는 파트 목록과 독립이므로 병렬 실행 — 날짜별 요구 인원 예외만 파트 id에 의존
    const [shiftsRes, assignRes] = await Promise.all([
      fetchRosterShifts(unit),
      applyUnitFilter(
        supabaseAdmin.from('roster_assignments').select(ASSIGNMENT_COLUMNS),
        unit,
      )
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date'),
    ])
    if (!shiftsRes.success || !shiftsRes.data) return { success: false, error: shiftsRes.error ?? '파트를 불러올 수 없습니다.' }
    if (assignRes.error) return { success: false, error: assignRes.error.message }
    const shifts = shiftsRes.data
    const shiftIds = shifts.map(s => s.id)

    const reqRes = shiftIds.length === 0
      ? { data: [], error: null }
      : await supabaseAdmin
          .from('roster_shift_requirements')
          .select('*')
          .in('shift_id', shiftIds)
          .gte('work_date', fromDate)
          .lte('work_date', toDate)
    if (reqRes.error) return { success: false, error: reqRes.error.message }
    return {
      success: true,
      data: {
        shifts,
        assignments: (assignRes.data ?? []) as unknown as RosterAssignment[],
        requirements: (reqRes.data ?? []) as RosterShiftRequirement[],
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function addRosterAssignment(
  unit: RosterUnit,
  workDate: string,
  shiftId: number,
  staffId: number,
): Promise<ApiResponse<RosterAssignment>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .insert([{ work_date: workDate, shift_id: shiftId, staff_id: staffId, staff_role: unit.staffRole, store_id: unit.storeId }])
      .select(ASSIGNMENT_COLUMNS)
      .single()
    if (error) {
      if (error.code === '23505') return { success: false, error: '이미 해당 파트에 배정되어 있습니다.' }
      return { success: false, error: error.message }
    }
    return { success: true, data: data as unknown as RosterAssignment }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function removeRosterAssignment(id: number): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin.from('roster_assignments').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateRosterAssignmentTime(
  id: number,
  startTime: string | null,
  endTime: string | null,
): Promise<ApiResponse<RosterAssignment>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .update({ start_time: startTime, end_time: endTime })
      .eq('id', id)
      .select(ASSIGNMENT_COLUMNS)
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as unknown as RosterAssignment }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// 되돌리기용 스냅샷 — 삭제 행 재삽입과 수정 행 원복에 필요한 최소 필드
export interface RosterAssignmentSnapshot {
  work_date: string
  shift_id: number
  staff_id: number
  staff_role: StaffRole
  store_id: number | null
  start_time: string | null
  end_time: string | null
}

export interface RosterUndoPayload {
  deleted: RosterAssignmentSnapshot[]
  updated: { id: number; shift_id?: number; staff_id?: number; start_time?: string | null; end_time?: string | null }[]
}

const SNAPSHOT_COLUMNS = 'work_date, shift_id, staff_id, staff_role, store_id, start_time, end_time'

/** 파괴적 작업(초기화·일괄 해제·이동·교환) 되돌리기 — 삭제 행 재삽입 + 수정 행 원복 */
export async function undoRosterChange(payload: RosterUndoPayload): Promise<ApiResponse<{ restored: number }>> {
  try {
    let restored = 0
    if (payload.deleted.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('roster_assignments')
        .upsert(payload.deleted, { onConflict: 'work_date,shift_id,staff_id', ignoreDuplicates: true })
        .select('id')
      if (error) return { success: false, error: error.message }
      restored += (data ?? []).length
    }
    if (payload.updated.length > 0) {
      const results = await Promise.all(
        payload.updated.map(({ id, ...fields }) =>
          supabaseAdmin.from('roster_assignments').update(fields).eq('id', id),
        ),
      )
      const failed = results.find(r => r.error)
      if (failed?.error) return { success: false, error: failed.error.message }
      restored += payload.updated.length
    }
    return { success: true, data: { restored } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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
  try {
    if (fromShiftId === toShiftId) return { success: false, error: '같은 파트로는 이동할 수 없습니다.' }
    // 원본 배정과 대상 파트의 기존 배정을 함께 조회 — 같은 날 대상 파트에 이미 있으면 unique 충돌
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, start_time, end_time'),
      unit,
    )
      .eq('staff_id', staffId)
      .in('shift_id', [fromShiftId, toShiftId])
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (error) return { success: false, error: error.message }
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
      if (moveError) return { success: false, error: moveError.message }
    }
    if (toMerge.length > 0) {
      const { error: mergeError } = await supabaseAdmin
        .from('roster_assignments')
        .delete()
        .in('id', toMerge.map(r => r.id))
      if (mergeError) return { success: false, error: mergeError.message }
    }
    const undo: RosterUndoPayload = {
      deleted: toMerge.map(r => ({
        work_date: r.work_date, shift_id: fromShiftId, staff_id: staffId,
        staff_role: unit.staffRole, store_id: unit.storeId,
        start_time: r.start_time, end_time: r.end_time,
      })),
      updated: toMove.map(r => ({ id: r.id, shift_id: fromShiftId, start_time: r.start_time, end_time: r.end_time })),
    }
    return { success: true, data: { moved: toMove.length, merged: toMerge.length, undo } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 특정 근무자의 기간 내 배정 일괄 해제 — shiftId를 주면 해당 파트만 */
export async function clearStaffAssignments(
  unit: RosterUnit,
  staffId: number,
  fromDate: string,
  toDate: string,
  shiftId: number | null,
): Promise<ApiResponse<{ removed: number; undo: RosterUndoPayload }>> {
  try {
    let q = supabaseAdmin
      .from('roster_assignments')
      .delete()
      .eq('staff_role', unit.staffRole)
      .eq('staff_id', staffId)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (shiftId !== null) q = q.eq('shift_id', shiftId)
    const { data, error } = unit.storeId === null
      ? await q.is('store_id', null).select(SNAPSHOT_COLUMNS)
      : await q.eq('store_id', unit.storeId).select(SNAPSHOT_COLUMNS)
    if (error) return { success: false, error: error.message }
    const rows = (data ?? []) as unknown as RosterAssignmentSnapshot[]
    return { success: true, data: { removed: rows.length, undo: { deleted: rows, updated: [] } } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 두 근무자의 기간 내 배정을 서로 교환 — 같은 날 같은 파트에 둘 다 배정된 슬롯은 교환해도 동일하므로 제외 */
export async function swapStaffAssignments(
  unit: RosterUnit,
  staffAId: number,
  staffBId: number,
  fromDate: string,
  toDate: string,
): Promise<ApiResponse<{ swapped: number; undo: RosterUndoPayload }>> {
  try {
    if (staffAId === staffBId) return { success: false, error: '서로 다른 근무자를 선택하세요.' }
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, staff_id'),
      unit,
    )
      .in('staff_id', [staffAId, staffBId])
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    if (error) return { success: false, error: error.message }
    const rows = (data ?? []) as { id: number; work_date: string; shift_id: number; staff_id: number }[]
    const slotKey = (r: { work_date: string; shift_id: number }) => `${r.work_date}|${r.shift_id}`
    const aKeys = new Set(rows.filter(r => r.staff_id === staffAId).map(slotKey))
    const bKeys = new Set(rows.filter(r => r.staff_id === staffBId).map(slotKey))
    const aRows = rows.filter(r => r.staff_id === staffAId && !bKeys.has(slotKey(r)))
    const bRows = rows.filter(r => r.staff_id === staffBId && !aKeys.has(slotKey(r)))
    if (aRows.length + bRows.length === 0) return { success: true, data: { swapped: 0, undo: { deleted: [], updated: [] } } }

    if (aRows.length > 0) {
      const { error: aError } = await supabaseAdmin
        .from('roster_assignments')
        .update({ staff_id: staffBId })
        .in('id', aRows.map(r => r.id))
      if (aError) return { success: false, error: aError.message }
    }
    if (bRows.length > 0) {
      const { error: bError } = await supabaseAdmin
        .from('roster_assignments')
        .update({ staff_id: staffAId })
        .in('id', bRows.map(r => r.id))
      if (bError) return { success: false, error: bError.message }
    }
    const undo: RosterUndoPayload = {
      deleted: [],
      updated: [
        ...aRows.map(r => ({ id: r.id, staff_id: staffAId })),
        ...bRows.map(r => ({ id: r.id, staff_id: staffBId })),
      ],
    }
    return { success: true, data: { swapped: aRows.length + bRows.length, undo } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function setShiftRequirement(
  workDate: string,
  shiftId: number,
  required: number,
): Promise<ApiResponse<RosterShiftRequirement>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_shift_requirements')
      .upsert([{ work_date: workDate, shift_id: shiftId, required }], { onConflict: 'work_date,shift_id' })
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterShiftRequirement }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 날짜별 예외를 제거하고 파트 기본값으로 되돌린다 */
export async function clearShiftRequirement(workDate: string, shiftId: number): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin
      .from('roster_shift_requirements')
      .delete()
      .eq('work_date', workDate)
      .eq('shift_id', shiftId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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

type InsertRow = { work_date: string; shift_id: number; staff_id: number; staff_role: StaffRole; store_id: number | null }

interface GreedyCtx {
  dates: string[]
  shifts: RosterShift[]
  shiftById: Map<number, RosterShift>
  getRequired: (dateStr: string, shift: RosterShift) => number
  filledCount: Map<string, number>
  assignedByDate: Map<string, Set<number>>
  workload: Map<number, number>
  weeklyCount: Map<string, number>
  groupLoad: Map<string, number>
  staffEndByDate: Map<string, string>
  unit: RosterUnit
}

// 연속성 점수: 고립된 근무일(앞뒤 모두 비근무) 개수 — 낮을수록 좋음
function scoreInserts(
  newInserts: { work_date: string; staff_id: number }[],
  existing: { work_date: string; staff_id: number }[],
  fromDate: string,
  toDate: string,
): number {
  const byStaff = new Map<number, Set<string>>()
  for (const a of existing.filter(a => a.work_date >= fromDate && a.work_date <= toDate)) {
    if (!byStaff.has(a.staff_id)) byStaff.set(a.staff_id, new Set())
    byStaff.get(a.staff_id)!.add(a.work_date)
  }
  for (const ins of newInserts) {
    if (!byStaff.has(ins.staff_id)) byStaff.set(ins.staff_id, new Set())
    byStaff.get(ins.staff_id)!.add(ins.work_date)
  }
  let score = 0
  for (const [, dateSet] of byStaff) {
    const sorted = [...dateSet].sort()
    for (let i = 0; i < sorted.length; i++) {
      const prev = i > 0 ? sorted[i - 1] : null
      const next = i < sorted.length - 1 ? sorted[i + 1] : null
      const prevGap = prev ? Math.round((parseDate(sorted[i]).getTime() - parseDate(prev).getTime()) / 86400000) : 99
      const nextGap = next ? Math.round((parseDate(next).getTime() - parseDate(sorted[i]).getTime()) / 86400000) : 99
      if (prevGap > 1 && nextGap > 1) score++
    }
  }
  return score
}

// 결정적 셔플 (LCG 시드)
function shuffleStaff(arr: StaffProfile[], seed: number): StaffProfile[] {
  const result = [...arr]
  let s = (seed + 1) * 1664525 + 1013904223
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    const j = Math.abs(s) % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function runGreedy(staffList: StaffProfile[], ctx: GreedyCtx): { inserts: InsertRow[]; holes: AutoFillResult['holes']; log: AutoFillLogEntry[] } {
  const { dates, shifts, shiftById, getRequired, unit } = ctx
  // 후보별 독립 실행을 위해 가변 상태 복사
  const fc = new Map(ctx.filledCount)
  const abd = new Map([...ctx.assignedByDate].map(([k, v]) => [k, new Set(v)]))
  const wl = new Map(ctx.workload)
  const wc = new Map(ctx.weeklyCount)
  const gl = new Map(ctx.groupLoad)
  const sed = new Map(ctx.staffEndByDate)

  const inserts: InsertRow[] = []
  const holes: AutoFillResult['holes'] = []
  const log: AutoFillLogEntry[] = []

  for (const dateStr of dates) {
    const dayAssigned = abd.get(dateStr) ?? new Set<number>()
    const weekStart = getWeekStart(dateStr)
    const prevAssigned = abd.get(prevDate(dateStr))
    const day = dayOfWeek(dateStr)
    const grp = dayGroup(dateStr)

    const isAvailable = (s: StaffProfile, shiftId: number) => {
      if (dayAssigned.has(s.id)) return false
      if (s.max_days_per_week != null && (wc.get(`${s.id}|${weekStart}`) ?? 0) >= s.max_days_per_week) return false
      if (s.available_ranges.length > 0 && !s.available_ranges.some(r => r.from <= dateStr && dateStr <= r.to)) return false
      if (s.preferred_shift_ids.length > 0 && !s.preferred_shift_ids.includes(shiftId)) return false
      const prevEnd = sed.get(`${prevDate(dateStr)}|${s.id}`)
      const todayShift = shiftById.get(shiftId)
      if (prevEnd && todayShift && toMinutes(todayShift.start_time) + 24 * 60 - toMinutes(prevEnd) < MIN_REST_MINUTES) return false
      return true
    }

    // 가능 인원이 적은 파트 우선
    const pendingShifts = shifts
      .map(shift => {
        if (shift.active_from && dateStr < shift.active_from) return null
        if (shift.active_to && dateStr > shift.active_to) return null
        const required = getRequired(dateStr, shift)
        const filled = fc.get(`${dateStr}|${shift.id}`) ?? 0
        if (filled >= required) return null
        const eligibleCount = staffList.filter(s => isAvailable(s, shift.id)).length
        return { shift, required, eligibleCount }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.eligibleCount - b.eligibleCount)

    for (const { shift, required } of pendingShifts) {
      let filled = fc.get(`${dateStr}|${shift.id}`) ?? 0

      const eligible = staffList
        .filter(s => isAvailable(s, shift.id))
        .sort((a, b) => {
          // 그룹 부하 ±1 버킷 안에서 스트릭 우선 → 연속 블록 형성
          const aGrpBucket = Math.floor((gl.get(`${a.id}|${grp}`) ?? 0) / 2)
          const bGrpBucket = Math.floor((gl.get(`${b.id}|${grp}`) ?? 0) / 2)
          const aStreak = prevAssigned?.has(a.id) ? 0 : 1
          const bStreak = prevAssigned?.has(b.id) ? 0 : 1
          const aDayPref = a.preferred_days.length === 0 || a.preferred_days.includes(day) ? 0 : 1
          const bDayPref = b.preferred_days.length === 0 || b.preferred_days.includes(day) ? 0 : 1
          const aGroupLoad = gl.get(`${a.id}|${grp}`) ?? 0
          const bGroupLoad = gl.get(`${b.id}|${grp}`) ?? 0
          const aLoad = wl.get(a.id) ?? 0
          const bLoad = wl.get(b.id) ?? 0
          const aShiftPref = a.preferred_shift_ids.length === 0 || a.preferred_shift_ids.includes(shift.id) ? 0 : 1
          const bShiftPref = b.preferred_shift_ids.length === 0 || b.preferred_shift_ids.includes(shift.id) ? 0 : 1
          return aGrpBucket - bGrpBucket || aStreak - bStreak || aDayPref - bDayPref || aGroupLoad - bGroupLoad || aLoad - bLoad || aShiftPref - bShiftPref || a.id - b.id
        })

      const names: string[] = []
      for (const s of eligible) {
        if (filled >= required) break
        inserts.push({ work_date: dateStr, shift_id: shift.id, staff_id: s.id, staff_role: unit.staffRole, store_id: unit.storeId })
        names.push(s.name)
        filled++
        dayAssigned.add(s.id)
        wl.set(s.id, (wl.get(s.id) ?? 0) + 1)
        wc.set(`${s.id}|${weekStart}`, (wc.get(`${s.id}|${weekStart}`) ?? 0) + 1)
        const gk = `${s.id}|${grp}`
        gl.set(gk, (gl.get(gk) ?? 0) + 1)
        sed.set(`${dateStr}|${s.id}`, shift.end_time)
      }
      if (names.length > 0) log.push({ date: dateStr, shiftName: shift.name, names })
      if (filled < required) holes.push({ date: dateStr, shiftName: shift.name, missing: required - filled })
    }

    abd.set(dateStr, dayAssigned)
  }

  return { inserts, holes, log }
}

/**
 * 빈 자리 자동 배정 (fromDate~toDate, 양끝 포함). 단위(주방/매장)별로 독립 동작.
 * - 해당 단위의 확정(confirmed) 직원만 대상
 * - 파트/요일/가용기간 조건이 모두 맞는 직원만 배정
 * - 같은 날 여러 파트 중복 배정 금지
 * - 주 최대 근무일(max_days_per_week) 초과 배정 금지 (주 = 일~토, 달력 표시 기준)
 * - 기간 내 근무일이 적은 직원부터 우선 배정해 균등하게 분배
 */
export async function autoFillRoster(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<AutoFillResult>> {
  try {
    const shiftsRes = await fetchRosterShifts(unit)
    if (!shiftsRes.success || !shiftsRes.data) return { success: false, error: shiftsRes.error ?? '파트를 불러올 수 없습니다.' }
    const shifts = shiftsRes.data
    const shiftIds = shifts.map(s => s.id)

    const weekFrom = getWeekStart(fromDate)
    const weekTo = addDays(getWeekStart(toDate), 6)
    const staffQuery = supabaseAdmin.from('staff_profiles').select('*').eq('status', 'confirmed').eq('staff_role', unit.staffRole)
    const [staffRes, assignRes, reqRes] = await Promise.all([
      unit.storeId === null ? staffQuery.is('store_id', null) : staffQuery.eq('store_id', unit.storeId),
      applyUnitFilter(
        supabaseAdmin.from('roster_assignments').select('id, work_date, shift_id, staff_id'),
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
    if (staffRes.error) return { success: false, error: staffRes.error.message }
    if (assignRes.error) return { success: false, error: assignRes.error.message }
    if (reqRes.error) return { success: false, error: reqRes.error.message }

    const staff = (staffRes.data ?? []) as StaffProfile[]
    const overrides = new Map((reqRes.data ?? []).map(q => [`${q.work_date}|${q.shift_id}`, q.required as number]))

    const getRequired = (dateStr: string, shift: RosterShift): number => {
      const override = overrides.get(`${dateStr}|${shift.id}`)
      if (override !== undefined) return override
      const day = dayOfWeek(dateStr)
      return day === 0 || day === 6 ? shift.weekend_required : shift.weekday_required
    }

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
      const sh = shiftById.get(a.shift_id)
      if (sh) staffEndByDate.set(`${a.work_date}|${a.staff_id}`, sh.end_time)
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
      if (insertError) return { success: false, error: insertError.message }
    }

    return { success: true, data: { added: bestInserts.length, holes: bestHoles, log: bestLog } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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
  hourlyRate: number | null
}

/**
 * 로그인한 근무자 본인의 확정 근무 일정.
 * staff_profiles.user_profile_id로 연결된 프로필이 없으면 data: null (섹션 숨김용).
 */
export async function bulkAddRosterAssignments(
  unit: RosterUnit,
  shiftId: number,
  staffId: number,
  dates: string[],
): Promise<ApiResponse<{ added: number; skipped: number }>> {
  if (dates.length === 0) return { success: true, data: { added: 0, skipped: 0 } }
  try {
    const inserts = dates.map(date => ({
      work_date: date,
      shift_id: shiftId,
      staff_id: staffId,
      staff_role: unit.staffRole,
      store_id: unit.storeId,
    }))
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .upsert(inserts, { onConflict: 'work_date,shift_id,staff_id', ignoreDuplicates: true })
      .select('id')
    if (error) return { success: false, error: error.message }
    const added = (data ?? []).length
    return { success: true, data: { added, skipped: dates.length - added } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 직전 주(일~토) 배정을 대상 주의 같은 요일로 복사 — 이미 있는 배정·지난 날짜는 건너뜀 */
export async function copyPreviousWeek(
  unit: RosterUnit,
  weekStart: string, // 대상 주의 일요일 (YYYY-MM-DD)
): Promise<ApiResponse<{ added: number; skipped: number }>> {
  try {
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_assignments').select('work_date, shift_id, staff_id, start_time, end_time'),
      unit,
    )
      .gte('work_date', addDays(weekStart, -7))
      .lte('work_date', addDays(weekStart, -1))
    if (error) return { success: false, error: error.message }

    const today = kstToday()
    const candidates = (data ?? [])
      .map(a => ({
        work_date: addDays(a.work_date, 7),
        shift_id: a.shift_id,
        staff_id: a.staff_id,
        staff_role: unit.staffRole,
        store_id: unit.storeId,
        start_time: a.start_time,
        end_time: a.end_time,
      }))
      .filter(r => r.work_date >= today)
    if (candidates.length === 0) return { success: true, data: { added: 0, skipped: 0 } }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('roster_assignments')
      .upsert(candidates, { onConflict: 'work_date,shift_id,staff_id', ignoreDuplicates: true })
      .select('id')
    if (insertError) return { success: false, error: insertError.message }
    const added = (inserted ?? []).length
    return { success: true, data: { added, skipped: candidates.length - added } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function clearRosterRange(
  unit: RosterUnit,
  fromDate: string,
  toDate: string,
): Promise<ApiResponse<{ removed: number; undo: RosterUndoPayload }>> {
  try {
    const q = supabaseAdmin
      .from('roster_assignments')
      .delete()
      .eq('staff_role', unit.staffRole)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    const { data, error } = unit.storeId === null
      ? await q.is('store_id', null).select(SNAPSHOT_COLUMNS)
      : await q.eq('store_id', unit.storeId).select(SNAPSHOT_COLUMNS)
    if (error) return { success: false, error: error.message }
    const rows = (data ?? []) as unknown as RosterAssignmentSnapshot[]
    return { success: true, data: { removed: rows.length, undo: { deleted: rows, updated: [] } } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface DailyDigestShift {
  shiftName: string
  startTime: string
  endTime: string
  names: string[]
}

// 내일(KST) 배정 현황 — 디스코드 일일 근무 안내용
export async function fetchTomorrowRosterDigest(): Promise<{ dateLabel: string; shifts: DailyDigestShift[] }> {
  const tomorrow = addDays(kstToday(), 1)
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
  const d = parseDate(tomorrow)
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일(${DAY_NAMES[d.getDay()]})`

  const { data: assignData } = await supabaseAdmin
    .from('roster_assignments')
    .select('start_time, end_time, roster_shifts (name, start_time, end_time, sort_order), staff_profiles (name)')
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

export interface WeeklyRosterEntry {
  work_date: string
  shift_name: string
  name: string
  phone: string | null
  start_time: string
  end_time: string
}

export async function fetchWeeklyRosterForPrint(from: string, to: string, staffRole?: StaffRole): Promise<ApiResponse<WeeklyRosterEntry[]>> {
  try {
    const staffQuery = supabaseAdmin
      .from('staff_profiles')
      .select('id, name, phone, sort_order')
      .eq('status', 'confirmed')
    const { data: staffData, error: staffError } = staffRole
      ? await staffQuery.eq('staff_role', staffRole)
      : await staffQuery
    if (staffError) return { success: false, error: staffError.message }

    const staffArr = (staffData ?? []) as { id: number; name: string; phone: string | null; sort_order: number }[]
    if (staffArr.length === 0) return { success: true, data: [] }

    const staffMap = new Map(staffArr.map(s => [s.id, s]))

    const { data: assignData, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, start_time, end_time, staff_id, roster_shifts (name, start_time, end_time, sort_order)')
      .gte('work_date', from)
      .lte('work_date', to)
      .in('staff_id', staffArr.map(s => s.id))
      .order('work_date')
    if (assignError) return { success: false, error: assignError.message }

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

    return {
      success: true,
      data: withOrder.map(({ sort_order: _s, shift_sort_order: _ss, ...entry }) => entry),
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function getMyRoster(): Promise<ApiResponse<MyRosterData | null>> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data: staff, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, hourly_rate')
      .eq('user_profile_id', user.id)
      .maybeSingle()
    if (staffError) return { success: false, error: staffError.message }
    if (!staff) return { success: true, data: null }

    // KST 기준 이번 달 1일 ~ 다음 달 말일
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const y = kst.getUTCFullYear()
    const m = kst.getUTCMonth()
    const pad = (n: number) => String(n).padStart(2, '0')
    const from = `${y}-${pad(m + 1)}-01`
    const endNext = new Date(Date.UTC(y, m + 2, 0))
    const to = `${endNext.getUTCFullYear()}-${pad(endNext.getUTCMonth() + 1)}-${pad(endNext.getUTCDate())}`

    const { data: assignData, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, start_time, end_time, roster_shifts (name, start_time, end_time, break_minutes)')
      .eq('staff_id', staff.id)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date')
    if (assignError) return { success: false, error: assignError.message }

    const shifts: MyShift[] = (assignData ?? []).map(a => {
      const shift = a.roster_shifts as unknown as { name: string; start_time: string; end_time: string; break_minutes: number } | null
      const start = a.start_time ?? shift?.start_time ?? '00:00'
      const end = a.end_time ?? shift?.end_time ?? '00:00'
      let mins = toMinutes(end) - toMinutes(start)
      if (mins < 0) mins += 24 * 60
      const hours = Math.round((mins / 60) * 10) / 10
      const breakMinutes = shift?.break_minutes ?? 0
      return {
        work_date: a.work_date,
        shift_name: shift?.name ?? '근무',
        start_time: start,
        end_time: end,
        hours,
        breakMinutes,
        netHours: Math.round((hours - breakMinutes / 60) * 10) / 10,
      }
    })

    return { success: true, data: { shifts, hourlyRate: staff.hourly_rate ?? null } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
