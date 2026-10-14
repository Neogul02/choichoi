'use server'

// 주방 출근부(키오스크) — 출근·퇴근은 각각 한 번만 누를 수 있다.
// 퇴근하면 실측 시각이 그날의 배정 행(roster_assignments)에 덮어써지고, 급여·근무표는 그 행을 그대로 읽는다.
// 테이블·RPC의 이유는 supabase/migrations/20261014092902_create_attendance_records.sql 참고.

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { ApiResponse } from '@/types/api'
import { kstToday } from '@/lib/date'
import {
  OPEN_WINDOW_HOURS, isAttendanceBreak, isWithinOpenWindow, kstDateOf, kstHHMMOf, kstHHMMSSOf,
  resolveClockOutTimes, isBreakShort, payrollMonthKey,
} from '@/lib/attendance'
import { normalizePhone } from '@/lib/phone'
import { materializeFromShift, shiftStartPriority } from '@/lib/roster/query-helpers'
import { wrap, requireAdmin, requireKioskOrAdmin } from './_base'

export type AttendanceStatus = 'open' | 'closed' | 'voided'

export interface AttendanceBoardItem {
  staffId: number
  name: string
  /** 오늘 주방 근무표에 있는지 — 계획 시간은 키오스크에 보여주지 않고 정렬에만 쓴다 */
  scheduledToday: boolean
  record: {
    id: number
    status: AttendanceStatus
    workDate: string
    /** 'HH:MM:SS' — 화면 표시용 실제 찍은 시각 */
    clockIn: string
    clockOut: string | null
    breakMinutes: number | null
  } | null
}

export interface AttendanceBoard {
  today: string
  items: AttendanceBoardItem[]
}

interface RecordRow {
  id: number
  staff_id: number
  work_date: string
  assignment_id: number | null
  clock_in_at: string
  clock_out_at: string | null
  break_minutes: number | null
  status: AttendanceStatus
  unscheduled: boolean
}

const RECORD_COLUMNS = 'id, staff_id, work_date, assignment_id, clock_in_at, clock_out_at, break_minutes, status, unscheduled'

const openWindowStartIso = (nowMs: number) => new Date(nowMs - OPEN_WINDOW_HOURS * 3600 * 1000).toISOString()

/**
 * 직원의 "지금" 기록 — 오늘 출근한 기록, 없으면 아직 퇴근할 수 있는 어제 기록(자정 넘긴 근무).
 * 키오스크 화면과 출근·퇴근 액션이 같은 판정을 써야 버튼 상태와 서버 결과가 어긋나지 않는다.
 */
function pickCurrentRecord(rows: RecordRow[], today: string, nowMs: number): RecordRow | null {
  const todays = rows.find(r => r.work_date === today)
  if (todays) return todays
  return rows.find(r => r.status === 'open' && isWithinOpenWindow(Date.parse(r.clock_in_at), nowMs)) ?? null
}

async function fetchLiveRecords(nowMs: number, today: string, staffId?: number): Promise<RecordRow[]> {
  let q = supabaseAdmin
    .from('attendance_records')
    .select(RECORD_COLUMNS)
    .neq('status', 'voided')
    .or(`work_date.eq.${today},and(status.eq.open,clock_in_at.gt.${openWindowStartIso(nowMs)})`)
    .order('clock_in_at', { ascending: false })
  if (staffId != null) q = q.eq('staff_id', staffId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as RecordRow[]
}

/** 키오스크 화면 — 재직 중인 주방 직원 + 오늘 주방 근무표에 있는 사람 */
export async function fetchAttendanceBoard(): Promise<ApiResponse<AttendanceBoard>> {
  return wrap(async () => {
    await requireKioskOrAdmin()
    const nowMs = Date.now()
    const today = kstToday()

    const [staffRes, assignRes, records] = await Promise.all([
      supabaseAdmin
        .from('staff_profiles')
        .select('id, name, sort_order')
        .eq('staff_role', 'kitchen')
        .eq('status', 'confirmed')
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('roster_assignments')
        .select('staff_id, staff_profiles (name)')
        .eq('staff_role', 'kitchen')
        .eq('work_date', today),
      fetchLiveRecords(nowMs, today),
    ])
    if (staffRes.error) throw new Error(staffRes.error.message)
    if (assignRes.error) throw new Error(assignRes.error.message)

    const names = new Map<number, string>()
    const order: number[] = []
    for (const s of staffRes.data ?? []) {
      names.set(s.id, s.name)
      order.push(s.id)
    }
    const scheduled = new Set<number>()
    for (const a of assignRes.data ?? []) {
      const prof = (Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles) as { name: string } | null
      if (!names.has(a.staff_id)) {
        // 캐셔·퇴사 처리된 사람이라도 오늘 주방 근무표에 있으면 출근할 수 있어야 한다
        names.set(a.staff_id, prof?.name ?? '?')
        order.push(a.staff_id)
      }
      scheduled.add(a.staff_id)
    }
    const byStaff = new Map<number, RecordRow[]>()
    for (const r of records) {
      if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, [])
      byStaff.get(r.staff_id)!.push(r)
    }

    const items: AttendanceBoardItem[] = order.map(staffId => {
      const rec = pickCurrentRecord(byStaff.get(staffId) ?? [], today, nowMs)
      return {
        staffId,
        name: names.get(staffId) ?? '?',
        scheduledToday: scheduled.has(staffId),
        record: rec && {
          id: rec.id,
          status: rec.status,
          workDate: rec.work_date,
          clockIn: kstHHMMSSOf(Date.parse(rec.clock_in_at)),
          clockOut: rec.clock_out_at ? kstHHMMSSOf(Date.parse(rec.clock_out_at)) : null,
          breakMinutes: rec.break_minutes,
        },
      }
    })
    // 근무 중 → 출근 전 → 퇴근 완료. 근무 중은 먼저 온 순, 출근 전은 오늘 근무표에 있는 사람이 앞
    const rank = (i: AttendanceBoardItem) => (!i.record ? 1 : i.record.status === 'open' ? 0 : 2)
    items.sort((a, b) =>
      rank(a) - rank(b)
      || (rank(a) === 0 ? a.record!.clockIn.localeCompare(b.record!.clockIn) : 0)
      || Number(!a.scheduledToday) - Number(!b.scheduledToday))
    return { today, items }
  })
}

async function assertMonthNotSettled(staffId: number, workDate: string) {
  const { data, error } = await supabaseAdmin
    .from('payroll_payments')
    .select('id')
    .eq('staff_id', staffId)
    .eq('period_key', payrollMonthKey(workDate))
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data) throw new Error('이 달 급여 정산이 이미 완료되어 출퇴근을 기록·변경할 수 없습니다. 관리자에게 문의하세요.')
}

/**
 * 근무표에 없는 날 출근한 사람의 배정을 만들 파트 — 주방 출근은 10시로 일정하므로 10:00 시작 파트를 우선한다.
 * 출근만 하고 퇴근을 안 찍어도 급여에서 빠지지 않도록, 배정은 출근 시점에 만든다.
 */
async function pickDefaultKitchenShift(today: string) {
  const { data, error } = await supabaseAdmin
    .from('roster_shifts')
    .select('id, start_time, end_time, break_minutes, active_from, active_to, sort_order')
    .eq('staff_role', 'kitchen')
    .is('popup_id', null)
  if (error) throw new Error(error.message)
  const active = (data ?? []).filter(s =>
    (!s.active_from || s.active_from <= today) && (!s.active_to || s.active_to >= today))
  const pool = active.length > 0 ? active : (data ?? [])
  const shift = pool.find(s => s.start_time === '10:00')
    ?? [...pool].sort((a, b) => shiftStartPriority(a.start_time) - shiftStartPriority(b.start_time))[0]
  if (!shift) throw new Error('주방 파트가 없어 출근을 기록할 수 없습니다. 관리자에게 문의하세요.')
  return shift
}

/**
 * 본인 확인 — 키오스크는 이름만 누르면 남의 출퇴근도 찍을 수 있어서, 그 직원의 전화번호를 입력해야 기록한다.
 * 인사 프로필 번호를 우선하고, 비어 있으면 연결된 계정(user_profiles)의 번호를 쓴다. 비교는 숫자만.
 */
async function verifyStaffPhone(staffId: number, phoneInput: string): Promise<{ name: string }> {
  const { data, error } = await supabaseAdmin
    .from('staff_profiles')
    .select('name, phone, user_profiles (phone)')
    .eq('id', staffId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('직원을 찾을 수 없습니다.')
  const account = (Array.isArray(data.user_profiles) ? data.user_profiles[0] : data.user_profiles) as { phone: string | null } | null
  const registered = normalizePhone(data.phone || account?.phone || '')
  if (!registered) throw new Error(`${data.name}님의 전화번호가 등록되어 있지 않습니다. 관리자에게 문의하세요.`)
  if (normalizePhone(phoneInput) !== registered) throw new Error('전화번호가 일치하지 않습니다.')
  return { name: data.name }
}

export async function clockIn(staffId: number, phone: string): Promise<ApiResponse<{ name: string; time: string }>> {
  return wrap(async () => {
    await requireKioskOrAdmin()
    if (!Number.isInteger(staffId)) throw new Error('잘못된 요청입니다.')
    const staff = await verifyStaffPhone(staffId, String(phone ?? ''))
    // 시각은 서버 기준 — 아이패드 시계가 틀어져 있어도 기록이 흔들리지 않는다
    const nowMs = Date.now()
    const workDate = kstDateOf(nowMs)

    const current = pickCurrentRecord(await fetchLiveRecords(nowMs, workDate, staffId), workDate, nowMs)
    if (current?.work_date === workDate) throw new Error(`${staff.name}님은 오늘 이미 출근 처리되었습니다.`)
    if (current) throw new Error(`${staff.name}님의 어제 근무가 아직 퇴근 처리되지 않았습니다. 퇴근을 먼저 눌러주세요.`)
    // 퇴근이 배정 행을 덮어쓰므로, 지급 완료로 찍힌 달에 기록하면 이미 지급한 금액이 조용히 바뀐다
    await assertMonthNotSettled(staffId, workDate)

    const { data: assignment, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('id, start_time')
      .eq('staff_id', staffId)
      .eq('staff_role', 'kitchen')
      .eq('work_date', workDate)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (assignError) throw new Error(assignError.message)

    let assignmentId = assignment?.id ?? null
    const unscheduled = assignmentId == null
    if (unscheduled) {
      const shift = await pickDefaultKitchenShift(workDate)
      const { data: created, error: createError } = await supabaseAdmin
        .from('roster_assignments')
        .insert({
          work_date: workDate, shift_id: shift.id, staff_id: staffId,
          staff_role: 'kitchen', popup_id: null,
          ...materializeFromShift(shift),
        })
        .select('id')
        .single()
      if (createError) throw new Error(createError.message)
      assignmentId = created.id
    }

    const { error: insertError } = await supabaseAdmin.from('attendance_records').insert({
      staff_id: staffId,
      work_date: workDate,
      assignment_id: assignmentId,
      clock_in_at: new Date(nowMs).toISOString(),
      unscheduled,
    })
    if (insertError) {
      // 방금 만든 배정은 되돌린다 — 기록 없이 배정만 남으면 출근하지 않은 날이 근무로 잡힌다
      if (unscheduled && assignmentId != null) {
        await supabaseAdmin.from('roster_assignments').delete().eq('id', assignmentId)
      }
      if (insertError.code === '23505') throw new Error(`${staff.name}님은 오늘 이미 출근 처리되었습니다.`)
      throw new Error(insertError.message)
    }
    return { name: staff.name, time: kstHHMMSSOf(nowMs) }
  })
}

export async function clockOut(
  recordId: number,
  breakMinutes: number,
  phone: string,
): Promise<ApiResponse<{ name: string; time: string }>> {
  return wrap(async () => {
    await requireKioskOrAdmin()
    if (!isAttendanceBreak(breakMinutes)) throw new Error('휴게시간을 선택하세요.')

    const { data, error } = await supabaseAdmin
      .from('attendance_records')
      .select(RECORD_COLUMNS)
      .eq('id', recordId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('출근 기록을 찾을 수 없습니다.')
    const rec = data as RecordRow
    const { name } = await verifyStaffPhone(rec.staff_id, String(phone ?? ''))
    const nowMs = Date.now()
    if (rec.status !== 'open') throw new Error(`${name}님은 이미 퇴근 처리되었습니다.`)
    const clockInMs = Date.parse(rec.clock_in_at)
    if (!isWithinOpenWindow(clockInMs, nowMs)) {
      throw new Error(`출근 후 ${OPEN_WINDOW_HOURS}시간이 지나 퇴근을 기록할 수 없습니다. 관리자에게 문의하세요.`)
    }
    if (rec.assignment_id == null) throw new Error('연결된 근무가 없습니다. 관리자에게 문의하세요.')

    const { data: assignment, error: assignError } = await supabaseAdmin
      .from('roster_assignments')
      .select('start_time, roster_shifts!roster_assignments_shift_id_fkey (start_time)')
      .eq('id', rec.assignment_id)
      .single()
    if (assignError) throw new Error(assignError.message)
    const shift = assignment.roster_shifts as unknown as { start_time: string } | null
    const plannedStart = assignment.start_time ?? shift?.start_time ?? null

    const times = resolveClockOutTimes({ workDate: rec.work_date, clockInMs, clockOutMs: nowMs, plannedStart })
    if ('reason' in times) throw new Error(`근무 시작(${times.payStartTime}) 이후에 퇴근할 수 있습니다.`)

    const { error: rpcError } = await supabaseAdmin.rpc('attendance_clock_out', {
      p_record_id: rec.id,
      p_clock_out_at: new Date(nowMs).toISOString(),
      p_start_time: times.startTime,
      p_end_time: times.endTime,
      p_break_minutes: breakMinutes,
    })
    if (rpcError) {
      if (rpcError.message.includes('ATTENDANCE_NOT_OPEN')) throw new Error(`${name}님은 이미 퇴근 처리되었습니다.`)
      throw new Error(rpcError.message)
    }
    return { name, time: kstHHMMSSOf(nowMs) }
  })
}

// ── 관리자 ──────────────────────────────────────────────────────────────────

export interface AttendanceLogEntry {
  id: number
  staffId: number
  name: string
  workDate: string
  status: AttendanceStatus
  clockIn: string
  clockOut: string | null
  breakMinutes: number | null
  /** 근무표 계획(퇴근 시 덮어쓰기 직전 값) */
  plannedStart: string | null
  plannedEnd: string | null
  unscheduled: boolean
  /** 퇴근을 누르지 않은 채 퇴근 가능 시간이 지난 기록 — 근무표는 계획값 그대로다 */
  missingClockOut: boolean
  breakShort: boolean
}

/** 최근 기록 — 미퇴근·미예정 출근·법정 휴게 미달을 관리자가 확인한다 */
export async function fetchAttendanceLog(fromDate: string, toDate: string): Promise<ApiResponse<AttendanceLogEntry[]>> {
  return wrap(async () => {
    await requireAdmin()
    const nowMs = Date.now()
    const { data, error } = await supabaseAdmin
      .from('attendance_records')
      .select(`${RECORD_COLUMNS}, planned_start_time, planned_end_time, staff_profiles (name),
        roster_assignments!attendance_records_assignment_fkey (start_time, end_time)`)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
      .neq('status', 'voided')
      .order('work_date', { ascending: false })
      .order('clock_in_at', { ascending: true })
    if (error) throw new Error(error.message)
    type Row = RecordRow & {
      planned_start_time: string | null
      planned_end_time: string | null
      staff_profiles: { name: string } | null
      roster_assignments: { start_time: string | null; end_time: string | null } | null
    }
    return ((data ?? []) as unknown as Row[]).map(r => {
      const clockInMs = Date.parse(r.clock_in_at)
      // 퇴근 전이면 배정 행이 아직 계획값이다
      const plannedStart = r.status === 'closed' ? r.planned_start_time : r.roster_assignments?.start_time ?? null
      const plannedEnd = r.status === 'closed' ? r.planned_end_time : r.roster_assignments?.end_time ?? null
      const paidStart = r.roster_assignments?.start_time
      const paidEnd = r.roster_assignments?.end_time
      return {
        id: r.id,
        staffId: r.staff_id,
        name: r.staff_profiles?.name ?? '?',
        workDate: r.work_date,
        status: r.status,
        clockIn: kstHHMMOf(clockInMs),
        clockOut: r.clock_out_at ? kstHHMMOf(Date.parse(r.clock_out_at)) : null,
        breakMinutes: r.break_minutes,
        plannedStart,
        plannedEnd,
        unscheduled: r.unscheduled,
        missingClockOut: r.status === 'open' && !isWithinOpenWindow(clockInMs, nowMs),
        breakShort: r.status === 'closed' && r.break_minutes != null && !!paidStart && !!paidEnd
          && isBreakShort(paidStart, paidEnd, r.break_minutes),
      }
    })
  })
}

/**
 * 잘못 누른 기록 취소 — 퇴근까지 끝났으면 근무표를 계획값으로 되돌리고, 미예정 출근으로 만든 배정은 지운다.
 * 정산 완료된 달은 금액이 이미 지급됐으므로 막는다.
 */
export async function voidAttendance(recordId: number): Promise<ApiResponse> {
  return wrap(async () => {
    const user = await requireAdmin()
    const { data: rec, error } = await supabaseAdmin
      .from('attendance_records').select('id, staff_id, work_date').eq('id', recordId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!rec) throw new Error('기록을 찾을 수 없습니다.')
    await assertMonthNotSettled(rec.staff_id, rec.work_date)

    const { error: rpcError } = await supabaseAdmin.rpc('attendance_void', { p_record_id: recordId, p_user: user.id })
    if (rpcError) {
      if (rpcError.message.includes('ATTENDANCE_ALREADY_VOIDED')) throw new Error('이미 취소된 기록입니다.')
      throw new Error(rpcError.message)
    }
  })
}
