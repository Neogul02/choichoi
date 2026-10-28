// 출근부 판정 중 DB를 읽는 부분 — 서버 액션(인증 후)과 Cron 라우트(CRON_SECRET 확인 후)가 같이 쓴다.
// 'use server' 파일에 두면 인증 없이 호출 가능한 액션으로 노출되므로 여기 둔다. 호출하는 쪽이 권한을 검사할 것.

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { isWithinOpenWindow, kstHHMMOf } from '@/lib/attendance'

export interface MissingClockIn {
  assignmentId: number
  staffId: number
  name: string
  workDate: string
  /** 근무표 계획 — 출근 기록이 없으면 급여는 이 시각 그대로 계산된다 */
  plannedStart: string | null
  plannedEnd: string | null
}

/** since~until(둘 다 포함) 주방 배정 중 출근 기록이 없는 (직원, 날짜) — 날짜 범위 보정은 호출하는 쪽이 한다 */
export async function queryMissingClockIns(since: string, until: string): Promise<MissingClockIn[]> {
  const [assignRes, recordRes] = await Promise.all([
    supabaseAdmin
      .from('roster_assignments')
      .select('id, staff_id, work_date, start_time, end_time, staff_profiles (name), roster_shifts!roster_assignments_shift_id_fkey (start_time, end_time)')
      .eq('staff_role', 'kitchen')
      .gte('work_date', since)
      .lte('work_date', until)
      .order('work_date', { ascending: false })
      .order('start_time', { ascending: true }),
    supabaseAdmin
      .from('attendance_records')
      .select('staff_id, work_date')
      .gte('work_date', since)
      .lte('work_date', until)
      .neq('status', 'voided'),
  ])
  if (assignRes.error) throw new Error(assignRes.error.message)
  if (recordRes.error) throw new Error(recordRes.error.message)

  // 출근은 하루 한 번이라 (직원, 날짜)로 맞춘다 — 하루 배정이 둘이어도 한 번 찍었으면 근무한 날이다
  const punched = new Set((recordRes.data ?? []).map(r => `${r.staff_id}|${r.work_date}`))
  const seen = new Set<string>()
  const missing: MissingClockIn[] = []
  for (const a of assignRes.data ?? []) {
    const key = `${a.staff_id}|${a.work_date}`
    if (punched.has(key) || seen.has(key)) continue
    seen.add(key)
    const prof = (Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles) as { name: string } | null
    const shift = (Array.isArray(a.roster_shifts) ? a.roster_shifts[0] : a.roster_shifts) as { start_time: string; end_time: string } | null
    missing.push({
      assignmentId: a.id,
      staffId: a.staff_id,
      name: prof?.name ?? '?',
      workDate: a.work_date,
      plannedStart: a.start_time ?? shift?.start_time ?? null,
      plannedEnd: a.end_time ?? shift?.end_time ?? null,
    })
  }
  return missing
}

export interface StaleOpenRecord {
  name: string
  workDate: string
  clockIn: string
}

/** 퇴근을 누르지 않은 채 퇴근 가능 시간이 지난 기록 — 근무표는 계획값 그대로다 */
export async function queryStaleOpenRecords(since: string, nowMs: number): Promise<StaleOpenRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('attendance_records')
    .select('work_date, clock_in_at, staff_profiles (name)')
    .eq('status', 'open')
    .gte('work_date', since)
    .order('work_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter(r => !isWithinOpenWindow(Date.parse(r.clock_in_at), nowMs))
    .map(r => {
      const prof = (Array.isArray(r.staff_profiles) ? r.staff_profiles[0] : r.staff_profiles) as { name: string } | null
      return { name: prof?.name ?? '?', workDate: r.work_date, clockIn: kstHHMMOf(Date.parse(r.clock_in_at)) }
    })
}
