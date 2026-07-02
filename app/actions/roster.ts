'use server'

import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '@/types/api'
import type { RosterSettings, RosterRequirement, RosterAssignment, StaffProfile } from '@/types/database'
import { checkStaffAvailability } from '@/lib/staffing'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ASSIGNMENT_COLUMNS = 'id, work_date, shift, staff_id, start_time, end_time, created_at, staff_profiles (id, name, phone, preferred_shift, status)'

export async function fetchRosterSettings(): Promise<ApiResponse<RosterSettings>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterSettings }
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

export async function saveRosterSettings(input: RosterSettingsInput): Promise<ApiResponse<RosterSettings>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_settings')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', 1)
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
export async function fetchRosterRange(fromDate: string, toDate: string): Promise<ApiResponse<RosterMonthData>> {
  try {
    const [assignRes, reqRes] = await Promise.all([
      supabaseAdmin
        .from('roster_assignments')
        .select(ASSIGNMENT_COLUMNS)
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date'),
      supabaseAdmin
        .from('roster_requirements')
        .select('*')
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
  workDate: string,
  shift: 'AM' | 'PM',
  staffId: number,
): Promise<ApiResponse<RosterAssignment>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .insert([{ work_date: workDate, shift, staff_id: staffId }])
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
  workDate: string,
  amRequired: number,
  pmRequired: number,
): Promise<ApiResponse<RosterRequirement>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_requirements')
      .upsert([{ work_date: workDate, am_required: amRequired, pm_required: pmRequired }])
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterRequirement }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface AutoFillResult {
  added: number
  holes: { date: string; shift: 'AM' | 'PM'; missing: number }[]
}

/**
 * 빈 자리 자동 배정 (fromDate~toDate, 양끝 포함).
 * - 확정(confirmed) 직원만 대상
 * - 파트/요일/가용기간 조건이 모두 맞는 직원만 배정
 * - 같은 날 두 파트 중복 배정 금지
 * - 기간 내 근무일이 적은 직원부터 우선 배정해 균등하게 분배
 */
export async function autoFillRoster(fromDate: string, toDate: string): Promise<ApiResponse<AutoFillResult>> {
  try {
    const [settingsRes, staffRes, assignRes, reqRes] = await Promise.all([
      supabaseAdmin.from('roster_settings').select('*').eq('id', 1).single(),
      supabaseAdmin.from('staff_profiles').select('*').eq('status', 'confirmed'),
      supabaseAdmin.from('roster_assignments').select('id, work_date, shift, staff_id').gte('work_date', fromDate).lte('work_date', toDate),
      supabaseAdmin.from('roster_requirements').select('*').gte('work_date', fromDate).lte('work_date', toDate),
    ])
    if (settingsRes.error) return { success: false, error: settingsRes.error.message }
    if (staffRes.error) return { success: false, error: staffRes.error.message }
    if (assignRes.error) return { success: false, error: assignRes.error.message }
    if (reqRes.error) return { success: false, error: reqRes.error.message }

    const settings = settingsRes.data as RosterSettings
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
    for (const a of assignRes.data ?? []) {
      const key = `${a.work_date}|${a.shift}`
      filledCount.set(key, (filledCount.get(key) ?? 0) + 1)
      if (!assignedByDate.has(a.work_date)) assignedByDate.set(a.work_date, new Set())
      assignedByDate.get(a.work_date)!.add(a.staff_id)
      workload.set(a.staff_id, (workload.get(a.staff_id) ?? 0) + 1)
    }

    // 날짜 목록 생성
    const dates: string[] = []
    const cur = new Date(fromDate + 'T00:00:00')
    const end = new Date(toDate + 'T00:00:00')
    while (cur <= end) {
      dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
      cur.setDate(cur.getDate() + 1)
    }

    const inserts: { work_date: string; shift: 'AM' | 'PM'; staff_id: number }[] = []
    const holes: AutoFillResult['holes'] = []

    for (const dateStr of dates) {
      for (const shift of ['AM', 'PM'] as const) {
        const required = getRequired(dateStr, shift)
        let filled = filledCount.get(`${dateStr}|${shift}`) ?? 0
        if (filled >= required) continue

        const dayAssigned = assignedByDate.get(dateStr) ?? new Set<number>()
        const eligible = staff
          .filter(s => !dayAssigned.has(s.id) && checkStaffAvailability(s, dateStr, shift).ok)
          .sort((a, b) => (workload.get(a.id) ?? 0) - (workload.get(b.id) ?? 0) || a.id - b.id)

        for (const s of eligible) {
          if (filled >= required) break
          inserts.push({ work_date: dateStr, shift, staff_id: s.id })
          filled++
          dayAssigned.add(s.id)
          workload.set(s.id, (workload.get(s.id) ?? 0) + 1)
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

/** 날짜별 예외를 제거하고 기본값으로 되돌린다 */
export async function clearRosterRequirement(workDate: string): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin.from('roster_requirements').delete().eq('work_date', workDate)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
