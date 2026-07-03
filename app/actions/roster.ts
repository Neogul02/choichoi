'use server'

import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { ApiResponse } from '@/types/api'
import type { RosterSettings, RosterRequirement, RosterAssignment, StaffProfile, StaffRole } from '@/types/database'
import { checkStaffAvailability, getWeekStart } from '@/lib/staffing'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ASSIGNMENT_COLUMNS = 'id, work_date, shift, staff_id, staff_role, store_id, start_time, end_time, created_at, staff_profiles (id, name, phone, preferred_shift, status)'

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

const DEFAULT_SETTINGS = {
  am_start: '06:00',
  am_end: '15:00',
  pm_start: '15:00',
  pm_end: '22:00',
  weekday_am_required: 2,
  weekday_pm_required: 2,
  weekend_am_required: 2,
  weekend_pm_required: 2,
}

/** 단위별 설정 조회 — 없으면 기본값으로 생성해서 반환 */
export async function fetchRosterSettings(unit: RosterUnit): Promise<ApiResponse<RosterSettings>> {
  try {
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_settings').select('*'),
      unit,
    ).maybeSingle()
    if (error) return { success: false, error: error.message }
    if (data) return { success: true, data: data as RosterSettings }

    const { data: created, error: createError } = await supabaseAdmin
      .from('roster_settings')
      .insert([{ staff_role: unit.staffRole, store_id: unit.storeId, ...DEFAULT_SETTINGS }])
      .select('*')
      .single()
    if (createError) return { success: false, error: createError.message }
    return { success: true, data: created as RosterSettings }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface RosterSettingsInput {
  am_start: string
  am_end: string
  pm_start: string
  pm_end: string
  weekday_am_required: number
  weekday_pm_required: number
  weekend_am_required: number
  weekend_pm_required: number
}

export async function saveRosterSettings(unit: RosterUnit, input: RosterSettingsInput): Promise<ApiResponse<RosterSettings>> {
  try {
    const { data, error } = await applyUnitFilter(
      supabaseAdmin.from('roster_settings').update({ ...input, updated_at: new Date().toISOString() }),
      unit,
    )
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterSettings }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface RosterMonthData {
  assignments: RosterAssignment[]
  requirements: RosterRequirement[]
}

/** fromDate/toDate: YYYY-MM-DD (양끝 포함) */
export async function fetchRosterRange(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<RosterMonthData>> {
  try {
    const [assignRes, reqRes] = await Promise.all([
      applyUnitFilter(
        supabaseAdmin.from('roster_assignments').select(ASSIGNMENT_COLUMNS),
        unit,
      )
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date'),
      applyUnitFilter(
        supabaseAdmin.from('roster_requirements').select('*'),
        unit,
      )
        .gte('work_date', fromDate)
        .lte('work_date', toDate),
    ])
    if (assignRes.error) return { success: false, error: assignRes.error.message }
    if (reqRes.error) return { success: false, error: reqRes.error.message }
    return {
      success: true,
      data: {
        assignments: (assignRes.data ?? []) as unknown as RosterAssignment[],
        requirements: (reqRes.data ?? []) as RosterRequirement[],
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function addRosterAssignment(
  unit: RosterUnit,
  workDate: string,
  shift: 'AM' | 'PM',
  staffId: number,
): Promise<ApiResponse<RosterAssignment>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .insert([{ work_date: workDate, shift, staff_id: staffId, staff_role: unit.staffRole, store_id: unit.storeId }])
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

export async function setRosterRequirement(
  unit: RosterUnit,
  workDate: string,
  amRequired: number,
  pmRequired: number,
): Promise<ApiResponse<RosterRequirement>> {
  try {
    // 단위 유니크 인덱스가 표현식(coalesce) 기반이라 upsert 대신 select→update/insert
    const { data: existing, error: findError } = await applyUnitFilter(
      supabaseAdmin.from('roster_requirements').select('id'),
      unit,
    )
      .eq('work_date', workDate)
      .maybeSingle()
    if (findError) return { success: false, error: findError.message }

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('roster_requirements')
        .update({ am_required: amRequired, pm_required: pmRequired })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (error) return { success: false, error: error.message }
      return { success: true, data: data as RosterRequirement }
    }

    const { data, error } = await supabaseAdmin
      .from('roster_requirements')
      .insert([{
        work_date: workDate,
        staff_role: unit.staffRole,
        store_id: unit.storeId,
        am_required: amRequired,
        pm_required: pmRequired,
      }])
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterRequirement }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 날짜별 예외를 제거하고 기본값으로 되돌린다 */
export async function clearRosterRequirement(unit: RosterUnit, workDate: string): Promise<ApiResponse> {
  try {
    const { error } = await applyUnitFilter(
      supabaseAdmin.from('roster_requirements').delete(),
      unit,
    ).eq('work_date', workDate)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface AutoFillResult {
  added: number
  holes: { date: string; shift: 'AM' | 'PM'; missing: number }[]
}

/**
 * 빈 자리 자동 배정 (fromDate~toDate, 양끝 포함). 단위(주방/매장)별로 독립 동작.
 * - 해당 단위의 확정(confirmed) 직원만 대상
 * - 파트/요일/가용기간 조건이 모두 맞는 직원만 배정
 * - 같은 날 두 파트 중복 배정 금지
 * - 주 최대 근무일(max_days_per_week) 초과 배정 금지 (주 = 일~토, 달력 표시 기준)
 * - 기간 내 근무일이 적은 직원부터 우선 배정해 균등하게 분배
 */
export async function autoFillRoster(unit: RosterUnit, fromDate: string, toDate: string): Promise<ApiResponse<AutoFillResult>> {
  try {
    const settingsRes = await fetchRosterSettings(unit)
    if (!settingsRes.success || !settingsRes.data) return { success: false, error: settingsRes.error ?? '설정을 불러올 수 없습니다.' }
    const settings = settingsRes.data

    // 주간 상한 계산은 기간 양끝이 걸친 주 전체의 배정을 봐야 정확하다
    const weekFrom = getWeekStart(fromDate)
    const weekToDate = new Date(getWeekStart(toDate) + 'T00:00:00')
    weekToDate.setDate(weekToDate.getDate() + 6)
    const weekTo = `${weekToDate.getFullYear()}-${String(weekToDate.getMonth() + 1).padStart(2, '0')}-${String(weekToDate.getDate()).padStart(2, '0')}`

    const staffQuery = supabaseAdmin.from('staff_profiles').select('*').eq('status', 'confirmed').eq('staff_role', unit.staffRole)
    const [staffRes, assignRes, reqRes] = await Promise.all([
      unit.storeId === null ? staffQuery : staffQuery.eq('store_id', unit.storeId),
      applyUnitFilter(
        supabaseAdmin.from('roster_assignments').select('id, work_date, shift, staff_id'),
        unit,
      )
        .gte('work_date', weekFrom)
        .lte('work_date', weekTo),
      applyUnitFilter(
        supabaseAdmin.from('roster_requirements').select('*'),
        unit,
      )
        .gte('work_date', fromDate)
        .lte('work_date', toDate),
    ])
    if (staffRes.error) return { success: false, error: staffRes.error.message }
    if (assignRes.error) return { success: false, error: assignRes.error.message }
    if (reqRes.error) return { success: false, error: reqRes.error.message }

    const staff = (staffRes.data ?? []) as StaffProfile[]
    const requirements = new Map((reqRes.data ?? []).map(q => [q.work_date, q as RosterRequirement]))

    const getRequired = (dateStr: string, shift: 'AM' | 'PM'): number => {
      const override = requirements.get(dateStr)
      if (override) return shift === 'AM' ? override.am_required : override.pm_required
      const day = new Date(dateStr + 'T00:00:00').getDay()
      const isWeekend = day === 0 || day === 6
      if (shift === 'AM') return isWeekend ? settings.weekend_am_required : settings.weekday_am_required
      return isWeekend ? settings.weekend_pm_required : settings.weekday_pm_required
    }

    // 현재 배정 상태 인덱싱
    const filledCount = new Map<string, number>()        // `${date}|${shift}` → 배정 수
    const assignedByDate = new Map<string, Set<number>>() // date → 그날 배정된 staff_id (파트 무관)
    const workload = new Map<number, number>()            // staff_id → 기간 내 근무일 수
    const weeklyCount = new Map<string, number>()         // `${staff_id}|${주 시작일}` → 그 주 근무일 수
    for (const a of assignRes.data ?? []) {
      const key = `${a.work_date}|${a.shift}`
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

    const inserts: { work_date: string; shift: 'AM' | 'PM'; staff_id: number; staff_role: StaffRole; store_id: number | null }[] = []
    const holes: AutoFillResult['holes'] = []

    for (const dateStr of dates) {
      for (const shift of ['AM', 'PM'] as const) {
        const required = getRequired(dateStr, shift)
        let filled = filledCount.get(`${dateStr}|${shift}`) ?? 0
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
          inserts.push({ work_date: dateStr, shift, staff_id: s.id, staff_role: unit.staffRole, store_id: unit.storeId })
          filled++
          dayAssigned.add(s.id)
          workload.set(s.id, (workload.get(s.id) ?? 0) + 1)
          weeklyCount.set(`${s.id}|${weekStart}`, (weeklyCount.get(`${s.id}|${weekStart}`) ?? 0) + 1)
        }
        assignedByDate.set(dateStr, dayAssigned)

        if (filled < required) holes.push({ date: dateStr, shift, missing: required - filled })
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
  shift: 'AM' | 'PM'
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
      .select('id, hourly_rate, staff_role, store_id')
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

    const settingsRes = await fetchRosterSettings({ staffRole: staff.staff_role as StaffRole, storeId: staff.store_id ?? null })
    if (!settingsRes.success || !settingsRes.data) return { success: false, error: settingsRes.error ?? '설정을 불러올 수 없습니다.' }
    const settings = settingsRes.data

    const { data: assignData, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, shift, start_time, end_time')
      .eq('staff_id', staff.id)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date')
    if (assignError) return { success: false, error: assignError.message }

    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

    const shifts: MyShift[] = (assignData ?? []).map(a => {
      const start = a.start_time ?? (a.shift === 'AM' ? settings.am_start : settings.pm_start)
      const end = a.end_time ?? (a.shift === 'AM' ? settings.am_end : settings.pm_end)
      let mins = toMin(end) - toMin(start)
      if (mins < 0) mins += 24 * 60
      return {
        work_date: a.work_date,
        shift: a.shift as 'AM' | 'PM',
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
