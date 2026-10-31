'use server'

// 주방 출근부(키오스크) — 출근·퇴근은 각각 한 번만 누를 수 있다.
// 퇴근하면 실측 시각이 그날의 배정 행(roster_assignments)에 덮어써지고, 급여·근무표는 그 행을 그대로 읽는다.
// 테이블·RPC의 이유는 supabase/migrations/20261014092902_create_attendance_records.sql 참고.

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { ApiResponse } from '@/types/api'
import { addDays, kstToday } from '@/lib/date'
import {
  ATTENDANCE_LAUNCH_DATE, OPEN_WINDOW_HOURS, isAttendanceBreak, isWithinOpenWindow, kstDateOf, kstHHMMOf, kstHHMMSSOf, kstInstant,
  resolveClockOutTimes, isBreakShort, payrollMonthKey,
} from '@/lib/attendance'
import { crossesMidnight, paidMinutes } from '@/lib/workhours'
import { normalizePhone } from '@/lib/phone'
import { materializeFromShift, shiftStartPriority } from '@/lib/roster/query-helpers'
import { queryMissingClockIns, type MissingClockIn } from '@/lib/attendance-queries'
import { wrap, requireAdmin, requireKioskOrAdmin, requireManagerOrAdmin } from './_base'

export type AttendanceStatus = 'open' | 'closed' | 'voided'
export type { MissingClockIn }

export interface AttendanceBoardItem {
  staffId: number
  name: string
  /** 오늘 주방 근무표에 있는지 — 정렬(출근 전 중 근무표에 있는 사람이 앞)에 쓴다 */
  scheduledToday: boolean
  /** 오늘 근무표상 출근 시각 'HH:MM' — 근무표에 없거나 시각을 알 수 없으면 null. 카드에 "몇 시 출근" 기준으로 띄운다 */
  scheduledStart: string | null
  record: {
    id: number
    status: AttendanceStatus
    workDate: string
    /** 'HH:MM:SS' — 화면 표시용 실제 찍은 시각 */
    clockIn: string
    clockOut: string | null
    breakMinutes: number | null
    /** 퇴근 완료 기록의 유급 분 — 배정 행(관리자 정정 반영) 기준, 급여와 같은 숫자. 근무 중이면 null */
    paidMinutes: number | null
  } | null
}

/** 퇴근 결과 — 키오스크 완료 팝업에 그대로 보여준다 */
export interface ClockOutDone {
  name: string
  time: string
  /** 급여에 들어가는 시작·종료 — 실제 출근·퇴근 시각(분 단위 내림) */
  startTime: string
  endTime: string
  breakMinutes: number
  paidMinutes: number
  /** 이번 달 1일~오늘 유급 분 합계(오늘 포함) — 급여정산과 같은 계산. 조회 실패 시 null */
  monthPaidMinutes: number | null
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

interface LiveRecordRow extends RecordRow {
  roster_assignments: {
    start_time: string | null
    end_time: string | null
    break_minutes: number | null
    roster_shifts: { break_minutes: number | null } | null
  } | null
}

const livePaidMinutes = (r: LiveRecordRow): number | null => {
  const a = r.roster_assignments
  if (r.status !== 'closed' || !a?.start_time || !a.end_time) return null
  return paidMinutes(a.start_time, a.end_time, a.break_minutes, a.roster_shifts?.break_minutes)
}

const RECORD_COLUMNS = 'id, staff_id, work_date, assignment_id, clock_in_at, clock_out_at, break_minutes, status, unscheduled'

// 퇴근 완료 카드의 근무시간을 배정 행에서 읽는다 — 관리자가 근무표에서 정정한 값까지 급여와 같게 보인다
const LIVE_RECORD_COLUMNS = `${RECORD_COLUMNS},
  roster_assignments!attendance_records_assignment_fkey (start_time, end_time, break_minutes,
    roster_shifts!roster_assignments_shift_id_fkey (break_minutes))`

const openWindowStartIso = (nowMs: number) => new Date(nowMs - OPEN_WINDOW_HOURS * 3600 * 1000).toISOString()

/**
 * 직원의 "지금" 기록 — 오늘 출근한 기록, 없으면 아직 퇴근할 수 있는 어제 기록(자정 넘긴 근무).
 * 키오스크 화면과 출근·퇴근 액션이 같은 판정을 써야 버튼 상태와 서버 결과가 어긋나지 않는다.
 */
function pickCurrentRecord<R extends RecordRow>(rows: R[], today: string, nowMs: number): R | null {
  const todays = rows.find(r => r.work_date === today)
  if (todays) return todays
  return rows.find(r => r.status === 'open' && isWithinOpenWindow(Date.parse(r.clock_in_at), nowMs)) ?? null
}

async function fetchLiveRecords(nowMs: number, today: string, staffId?: number): Promise<LiveRecordRow[]> {
  let q = supabaseAdmin
    .from('attendance_records')
    .select(LIVE_RECORD_COLUMNS)
    .neq('status', 'voided')
    .or(`work_date.eq.${today},and(status.eq.open,clock_in_at.gt.${openWindowStartIso(nowMs)})`)
    .order('clock_in_at', { ascending: false })
  if (staffId != null) q = q.eq('staff_id', staffId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as LiveRecordRow[]
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
        .select('staff_id, start_time, staff_profiles (name), roster_shifts!roster_assignments_shift_id_fkey (start_time)')
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
    const startOf = new Map<number, string>()
    for (const a of assignRes.data ?? []) {
      const prof = (Array.isArray(a.staff_profiles) ? a.staff_profiles[0] : a.staff_profiles) as { name: string } | null
      if (!names.has(a.staff_id)) {
        // 캐셔·퇴사 처리된 사람이라도 오늘 주방 근무표에 있으면 출근할 수 있어야 한다
        names.set(a.staff_id, prof?.name ?? '?')
        order.push(a.staff_id)
      }
      scheduled.add(a.staff_id)
      // 배정 행의 확정값이 기준, 구 데이터(NULL)만 파트 시각을 빌린다 — 둘 다 없으면 00:00으로 꾸며내지 않고 비운다.
      // 하루에 배정이 둘이면 이른 쪽을 출근 기준으로 본다.
      const shift = (Array.isArray(a.roster_shifts) ? a.roster_shifts[0] : a.roster_shifts) as { start_time: string } | null
      const start = (a.start_time ?? shift?.start_time)?.slice(0, 5)
      if (start) {
        const prev = startOf.get(a.staff_id)
        if (!prev || start < prev) startOf.set(a.staff_id, start)
      }
    }
    const byStaff = new Map<number, LiveRecordRow[]>()
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
        scheduledStart: startOf.get(staffId) ?? null,
        record: rec && {
          id: rec.id,
          status: rec.status,
          workDate: rec.work_date,
          clockIn: kstHHMMSSOf(Date.parse(rec.clock_in_at)),
          clockOut: rec.clock_out_at ? kstHHMMSSOf(Date.parse(rec.clock_out_at)) : null,
          breakMinutes: rec.break_minutes,
          paidMinutes: livePaidMinutes(rec),
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

/** 근무일이 속한 달 1일~근무일까지 이 직원의 유급 분 — 퇴근 팝업의 '이번 달 누적'. 부가 정보라 실패해도 퇴근은 성공으로 둔다 */
async function monthPaidMinutesUntil(staffId: number, workDate: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from('roster_assignments')
    .select('start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey (start_time, end_time, break_minutes)')
    .eq('staff_id', staffId)
    .gte('work_date', `${workDate.slice(0, 7)}-01`)
    .lte('work_date', workDate)
  if (error) return null
  let total = 0
  for (const a of data ?? []) {
    const shift = (Array.isArray(a.roster_shifts) ? a.roster_shifts[0] : a.roster_shifts) as
      { start_time: string; end_time: string; break_minutes: number | null } | null
    const start = a.start_time ?? shift?.start_time
    const end = a.end_time ?? shift?.end_time
    if (start && end) total += paidMinutes(start, end, a.break_minutes, shift?.break_minutes)
  }
  return total
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
): Promise<ApiResponse<ClockOutDone>> {
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
      .select('roster_shifts!roster_assignments_shift_id_fkey (break_minutes)')
      .eq('id', rec.assignment_id)
      .single()
    if (assignError) throw new Error(assignError.message)
    const shift = assignment.roster_shifts as unknown as { break_minutes: number | null } | null

    const times = resolveClockOutTimes({ clockInMs, clockOutMs: nowMs })
    if ('reason' in times) throw new Error(`출근(${times.startTime}) 후 1분이 지나야 퇴근할 수 있습니다.`)

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
    return {
      name,
      time: kstHHMMSSOf(nowMs),
      monthPaidMinutes: await monthPaidMinutesUntil(rec.staff_id, rec.work_date),
      startTime: times.startTime,
      endTime: times.endTime,
      breakMinutes,
      paidMinutes: paidMinutes(times.startTime, times.endTime, breakMinutes, shift?.break_minutes),
    }
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
 * 근무표엔 주방 근무가 있는데 출근을 한 번도 찍지 않은 지난 날 — 급여는 계획값(예: 10:00~18:00) 그대로 잡힌다.
 * 결근인지 버튼만 잊은 건지 기계가 알 수 없어 급여는 건드리지 않고, 관리자가 근무표에서 정정·삭제하도록 띄우기만 한다.
 * 오늘은 아직 출근 전일 수 있으므로 어제까지만, 출근부 도입 전 날짜는 빼고 본다.
 * 급여정산 화면(매니저 열람 가능)에서도 같은 판정을 쓰므로 매니저도 조회할 수 있다.
 */
export async function fetchMissingClockIns(fromDate: string, toDate: string): Promise<ApiResponse<MissingClockIn[]>> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    const yesterday = addDays(kstToday(), -1)
    const until = toDate < yesterday ? toDate : yesterday
    const since = fromDate > ATTENDANCE_LAUNCH_DATE ? fromDate : ATTENDANCE_LAUNCH_DATE
    if (until < since) return []

    return queryMissingClockIns(since, until)
  })
}

/**
 * 출근을 못 찍었지만 일한 날 — 관리자가 실제 시작·종료를 넣으면 키오스크 퇴근과 똑같이 기록한다.
 * 배정 행만 고치면 출근 기록이 없어 계속 미출근으로 남으므로, 출퇴근 기록을 만들고 같은 RPC로 마감한다.
 * 계획값은 planned_*에 남아 '기록 취소'로 되돌릴 수 있다.
 */
export async function recordMissedAttendance(assignmentId: number, startTime: string, endTime: string): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin()
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/
    if (!hhmm.test(startTime) || !hhmm.test(endTime)) throw new Error('시각은 HH:MM 형식이어야 합니다.')
    if (startTime === endTime) throw new Error('시작과 종료가 같습니다.')

    const { data: a, error } = await supabaseAdmin
      .from('roster_assignments')
      .select('id, staff_id, work_date, break_minutes')
      .eq('id', assignmentId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!a) throw new Error('근무를 찾을 수 없습니다.')
    if (a.work_date >= kstToday()) throw new Error('오늘 근무는 출근부에서 직접 찍어주세요.')
    await assertMonthNotSettled(a.staff_id, a.work_date)

    const clockInMs = kstInstant(a.work_date, startTime)
    const clockOutMs = kstInstant(a.work_date, endTime) + (crossesMidnight(startTime, endTime) ? 24 * 3600 * 1000 : 0)

    const { data: rec, error: insertError } = await supabaseAdmin
      .from('attendance_records')
      .insert({
        staff_id: a.staff_id, work_date: a.work_date, assignment_id: a.id,
        clock_in_at: new Date(clockInMs).toISOString(), unscheduled: false,
      })
      .select('id')
      .single()
    if (insertError) {
      if (insertError.code === '23505') throw new Error('이 날은 이미 출퇴근 기록이 있습니다.')
      throw new Error(insertError.message)
    }

    // 휴게는 배정에 정해둔 값을 그대로 둔다(NULL이면 파트 기본 휴게) — 시간만 실측으로 바꾼다
    const { error: rpcError } = await supabaseAdmin.rpc('attendance_clock_out', {
      p_record_id: rec.id,
      p_clock_out_at: new Date(clockOutMs).toISOString(),
      p_start_time: startTime,
      p_end_time: endTime,
      p_break_minutes: a.break_minutes,
    })
    if (rpcError) {
      // 열린 기록만 남으면 키오스크에 '근무 중'으로 뜨므로 지운다
      await supabaseAdmin.from('attendance_records').delete().eq('id', rec.id)
      throw new Error(rpcError.message)
    }
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
