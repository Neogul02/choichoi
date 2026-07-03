'use server'

import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { ApiResponse } from '@/types/api'
import type { RosterShift, RosterShiftRequirement, RosterAssignment, StaffProfile, StaffRole } from '@/types/database'
import { checkStaffAvailability, getWeekStart } from '@/lib/staffing'

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
    const shiftsRes = await fetchRosterShifts(unit)
    if (!shiftsRes.success || !shiftsRes.data) return { success: false, error: shiftsRes.error ?? '파트를 불러올 수 없습니다.' }
    const shifts = shiftsRes.data
    const shiftIds = shifts.map(s => s.id)

    const [assignRes, reqRes] = await Promise.all([
      applyUnitFilter(
        supabaseAdmin.from('roster_assignments').select(ASSIGNMENT_COLUMNS),
        unit,
      )
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date'),
      supabaseAdmin
        .from('roster_shift_requirements')
        .select('*')
        .in('shift_id', shiftIds)
        .gte('work_date', fromDate)
        .lte('work_date', toDate),
    ])
    if (assignRes.error) return { success: false, error: assignRes.error.message }
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

export interface AutoFillResult {
  added: number
  holes: { date: string; shiftName: string; missing: number }[]
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

    // 주간 상한 계산은 기간 양끝이 걸친 주 전체의 배정을 봐야 정확하다
    const weekFrom = getWeekStart(fromDate)
    const weekToDate = new Date(getWeekStart(toDate) + 'T00:00:00')
    weekToDate.setDate(weekToDate.getDate() + 6)
    const weekTo = `${weekToDate.getFullYear()}-${String(weekToDate.getMonth() + 1).padStart(2, '0')}-${String(weekToDate.getDate()).padStart(2, '0')}`

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
      const day = new Date(dateStr + 'T00:00:00').getDay()
      return day === 0 || day === 6 ? shift.weekend_required : shift.weekday_required
    }

    // 현재 배정 상태 인덱싱
    const filledCount = new Map<string, number>()        // `${date}|${shift_id}` → 배정 수
    const assignedByDate = new Map<string, Set<number>>() // date → 그날 배정된 staff_id (파트 무관)
    const workload = new Map<number, number>()            // staff_id → 기간 내 근무일 수
    const weeklyCount = new Map<string, number>()         // `${staff_id}|${주 시작일}` → 그 주 근무일 수
    for (const a of assignRes.data ?? []) {
      const key = `${a.work_date}|${a.shift_id}`
      filledCount.set(key, (filledCount.get(key) ?? 0) + 1)
      if (!assignedByDate.has(a.work_date)) assignedByDate.set(a.work_date, new Set())
      assignedByDate.get(a.work_date)!.add(a.staff_id)
      workload.set(a.staff_id, (workload.get(a.staff_id) ?? 0) + 1)
      const weekKey = `${a.staff_id}|${getWeekStart(a.work_date)}`
      weeklyCount.set(weekKey, (weeklyCount.get(weekKey) ?? 0) + 1)
    }

    // 날짜 목록 생성
    const dates: string[] = []
    const cur = new Date(fromDate + 'T00:00:00')
    const end = new Date(toDate + 'T00:00:00')
    while (cur <= end) {
      dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
      cur.setDate(cur.getDate() + 1)
    }

    const inserts: { work_date: string; shift_id: number; staff_id: number; staff_role: StaffRole; store_id: number | null }[] = []
    const holes: AutoFillResult['holes'] = []

    for (const dateStr of dates) {
      for (const shift of shifts) {
        const required = getRequired(dateStr, shift)
        let filled = filledCount.get(`${dateStr}|${shift.id}`) ?? 0
        if (filled >= required) continue

        const dayAssigned = assignedByDate.get(dateStr) ?? new Set<number>()
        const weekStart = getWeekStart(dateStr)
        const eligible = staff
          .filter(s =>
            !dayAssigned.has(s.id) &&
            (s.max_days_per_week == null || (weeklyCount.get(`${s.id}|${weekStart}`) ?? 0) < s.max_days_per_week) &&
            checkStaffAvailability(s, dateStr, shift).ok)
          .sort((a, b) => (workload.get(a.id) ?? 0) - (workload.get(b.id) ?? 0) || a.id - b.id)

        for (const s of eligible) {
          if (filled >= required) break
          inserts.push({ work_date: dateStr, shift_id: shift.id, staff_id: s.id, staff_role: unit.staffRole, store_id: unit.storeId })
          filled++
          dayAssigned.add(s.id)
          workload.set(s.id, (workload.get(s.id) ?? 0) + 1)
          weeklyCount.set(`${s.id}|${weekStart}`, (weeklyCount.get(`${s.id}|${weekStart}`) ?? 0) + 1)
        }
        assignedByDate.set(dateStr, dayAssigned)

        if (filled < required) holes.push({ date: dateStr, shiftName: shift.name, missing: required - filled })
      }
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('roster_assignments').insert(inserts)
      if (insertError) return { success: false, error: insertError.message }
    }

    return { success: true, data: { added: inserts.length, holes } }
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
}

export interface MyRosterData {
  shifts: MyShift[] // 이번 달 1일 ~ 다음 달 말일
  hourlyRate: number | null
}

/**
 * 로그인한 근무자 본인의 확정 근무 일정.
 * staff_profiles.user_profile_id로 연결된 프로필이 없으면 data: null (섹션 숨김용).
 */
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
      .select('work_date, start_time, end_time, roster_shifts (name, start_time, end_time)')
      .eq('staff_id', staff.id)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date')
    if (assignError) return { success: false, error: assignError.message }

    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

    const shifts: MyShift[] = (assignData ?? []).map(a => {
      const shift = a.roster_shifts as unknown as { name: string; start_time: string; end_time: string } | null
      const start = a.start_time ?? shift?.start_time ?? '00:00'
      const end = a.end_time ?? shift?.end_time ?? '00:00'
      let mins = toMin(end) - toMin(start)
      if (mins < 0) mins += 24 * 60
      return {
        work_date: a.work_date,
        shift_name: shift?.name ?? '근무',
        start_time: start,
        end_time: end,
        hours: Math.round((mins / 60) * 10) / 10,
      }
    })

    return { success: true, data: { shifts, hourlyRate: staff.hourly_rate ?? null } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
