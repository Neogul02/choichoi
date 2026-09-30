'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import type { ApiResponse } from '@/types/api'
import type { StaffRole } from '@/types/database'
import { paidMinutes, shiftRawMinutes, minutesToHours, resolveBreakMinutes } from '@/lib/workhours'
import { DAY_NAMES as DAY_KO } from '@/lib/staffing'
import { decryptResidentId } from '@/lib/pii-crypto'
import { getAuthUser, isNextInternalControlFlowError, requireAdmin, requireManagerOrAdmin, wrap } from './_base'

export interface PayrollRow {
  staffId: number
  name: string
  phone: string | null
  bankName: string | null
  bankAccount: string | null
  hourlyRate: number | null
  days: number
  totalHours: number
  totalPay: number | null
}

export interface StaffWorkAssignment {
  date: string
  dayName: string
  shiftName: string
  startTime: string
  endTime: string
}

export async function fetchStaffAssignmentsInRange(
  staffId: number,
  fromDate: string,
  toDate: string,
  popupId?: number | null,
): Promise<ApiResponse<StaffWorkAssignment[]>> {
  try {
    const user = await getAuthUser()
    if (!user || user.role !== 'admin') return { success: false, error: '권한이 없습니다.' }

    let query = supabaseAdmin
      .from('roster_assignments')
      .select('work_date, start_time, end_time, roster_shifts!roster_assignments_shift_id_fkey(name, start_time, end_time)')
      .eq('staff_id', staffId)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
    // popup_id가 있으면 그 팝업 근무만 — 캐셔가 겸직으로 다른 팝업 로스터에도 배정된 경우
    // (staff_profiles.popup_id는 단일값이라 한 row가 여러 팝업 스케줄을 가질 수 있음, CLAUDE.md 참고)
    // 계약서에 다른 팝업 스케줄이 섞여 들어가는 것을 막는다.
    if (popupId != null) query = query.eq('popup_id', popupId)
    const { data, error } = await query.order('work_date', { ascending: true })

    if (error) return { success: false, error: error.message }

    const results: StaffWorkAssignment[] = (data ?? []).map(a => {
      const shiftRaw = a.roster_shifts
      const shift = (Array.isArray(shiftRaw) ? shiftRaw[0] : shiftRaw) as { name: string; start_time: string; end_time: string } | null
      const d = new Date(a.work_date + 'T00:00:00')
      return {
        date: a.work_date,
        dayName: DAY_KO[d.getDay()],
        shiftName: shift?.name ?? '파트 미정',
        // 근로계약서에 들어가는 시간 — 개별 수정된 근무 시간이 있으면 그 값이 실제 근무 조건이다
        startTime: a.start_time ?? shift?.start_time ?? '00:00',
        endTime: a.end_time ?? shift?.end_time ?? '00:00',
      }
    })

    return { success: true, data: results }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export interface StaffDayDetail {
  date: string
  shiftName: string
  startTime: string
  endTime: string
  /** 유급 시간 (휴게 차감 후, 0.1h 단위 반올림) */
  hours: number
  /** 실근무 분 (휴게 차감 전) */
  rawMinutes: number
  /** 휴게 차감 분 — 근무일별 오버라이드 > 파트 고정 휴게 > 기본 1시간 (resolveBreakMinutes) */
  breakMinutes: number
  /** 유급 분 — 월 합계는 이 값을 합산 후 시간 환산해야 fetchMonthlyPayroll과 일치 */
  paidMinutes: number
  /** 파트 기본 시간이 아닌 개별 수정 시간인지 */
  isCustomTime: boolean
  /** 기본 휴게시간(1시간)이 아닌 이 근무일만 개별 오버라이드된 값인지 */
  isCustomBreak: boolean
}

export async function fetchStaffMonthlyDetail(
  staffId: number,
  year: number,
  month: number, // 0-indexed
): Promise<ApiResponse<StaffDayDetail[]>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }
    if (user.role !== 'admin' && user.role !== 'manager') {
      const { data: own } = await supabaseAdmin
        .from('staff_profiles')
        .select('id')
        .eq('user_profile_id', user.id)
        .eq('id', staffId)
        .maybeSingle()
      if (!own) return { success: false, error: '권한이 없습니다.' }
    }

    const pad = (n: number) => String(n).padStart(2, '0')
    const from = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`

    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, shift_id, start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey(name, start_time, end_time, break_minutes), popup_events(start_date, end_date)')
      .eq('staff_id', staffId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: true })

    if (error) return { success: false, error: error.message }

    // 팝업 이벤트 종료 후에도 남아있는 유령 배정(직원이 다른 팝업으로 재배정된 뒤 예전 팝업 배정이 삭제되지 않은 경우)이
    // 급여에 중복 반영되는 것을 막는다 — 배정일이 연결된 팝업 이벤트 기간 밖이면 제외. 주방 등 popup_id가 없는 배정은 그대로 포함.
    const validRows = (data ?? []).filter(a => {
      const peRaw = a.popup_events
      const pe = (Array.isArray(peRaw) ? peRaw[0] : peRaw) as { start_date: string; end_date: string } | null
      if (!pe) return true
      return a.work_date >= pe.start_date && a.work_date <= pe.end_date
    })

    const details: StaffDayDetail[] = mapAssignmentsToDetails(validRows)

    return { success: true, data: details }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

// 팝업(행사) 기간이 월 경계를 넘어가도(예: 8/21~9/3) 한 번에 조회할 때 사용 — 캐셔 전용, 주방은 팝업에 속하지 않는다
export async function fetchStaffPopupDetail(
  staffId: number,
  popupId: number,
): Promise<ApiResponse<StaffDayDetail[]>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }
    if (user.role !== 'admin' && user.role !== 'manager') {
      const { data: own } = await supabaseAdmin
        .from('staff_profiles')
        .select('id')
        .eq('user_profile_id', user.id)
        .eq('id', staffId)
        .maybeSingle()
      if (!own) return { success: false, error: '권한이 없습니다.' }
    }

    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, shift_id, start_time, end_time, break_minutes, roster_shifts!roster_assignments_shift_id_fkey(name, start_time, end_time, break_minutes)')
      .eq('staff_id', staffId)
      .eq('popup_id', popupId)
      .order('work_date', { ascending: true })

    if (error) return { success: false, error: error.message }

    return { success: true, data: mapAssignmentsToDetails(data ?? []) }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

type AssignmentDetailRow = {
  work_date: string
  start_time: string | null
  end_time: string | null
  break_minutes: number | null
  roster_shifts: ShiftDetailRow[] | ShiftDetailRow | null
}

type ShiftDetailRow = { name: string; start_time: string; end_time: string; break_minutes: number }

function mapAssignmentsToDetails(rows: AssignmentDetailRow[]): StaffDayDetail[] {
  return rows.map(a => {
    const shiftRaw = a.roster_shifts
    const shift = (Array.isArray(shiftRaw) ? shiftRaw[0] : shiftRaw) as ShiftDetailRow | null
    const startTime: string = a.start_time ?? shift?.start_time ?? '00:00'
    const endTime: string = a.end_time ?? shift?.end_time ?? '00:00'
    const rawMinutes = shiftRawMinutes(startTime, endTime)
    const breakMinutes = resolveBreakMinutes(a.break_minutes, shift?.break_minutes)
    const paid = paidMinutes(startTime, endTime, a.break_minutes, shift?.break_minutes)
    return {
      date: a.work_date,
      shiftName: shift?.name ?? '파트 미정',
      startTime: startTime.slice(0, 5),
      endTime: endTime.slice(0, 5),
      hours: minutesToHours(paid),
      rawMinutes, breakMinutes, paidMinutes: paid,
      isCustomTime: a.start_time != null || a.end_time != null,
      isCustomBreak: a.break_minutes != null,
    }
  })
}

function buildPayrollRows(
  totals: Map<number, { days: number; minutes: number }>,
  staffMap: Map<number, { id: number; name: string; phone: string | null; bank_name: string | null; bank_account: string | null; hourly_rate: number | null }>,
): PayrollRow[] {
  const rows: PayrollRow[] = []
  for (const [staffId, { days, minutes }] of totals) {
    const staff = staffMap.get(staffId)
    if (!staff) continue
    const totalHours = minutesToHours(minutes)
    const totalPay = staff.hourly_rate != null ? Math.round(totalHours * staff.hourly_rate) : null
    rows.push({ staffId, name: staff.name, phone: staff.phone, bankName: staff.bank_name ?? null, bankAccount: staff.bank_account ?? null, hourlyRate: staff.hourly_rate, days, totalHours, totalPay })
  }
  rows.sort((a, b) => b.totalHours - a.totalHours)
  return rows
}

export async function fetchMonthlyPayroll(
  staffRole: StaffRole,
  year: number,
  month: number, // 0-indexed
): Promise<ApiResponse<PayrollRow[]>> {
  try {
    const user = await getAuthUser()
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return { success: false, error: '권한이 없습니다.' }

    const pad = (n: number) => String(n).padStart(2, '0')
    const from = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`

    const [assignRes, staffRes, shiftRes] = await Promise.all([
      supabaseAdmin
        .from('roster_assignments')
        .select('staff_id, shift_id, start_time, end_time, break_minutes, work_date, popup_events(start_date, end_date)')
        .eq('staff_role', staffRole)
        .gte('work_date', from)
        .lte('work_date', to),
      supabaseAdmin
        .from('staff_profiles')
        .select('id, name, phone, bank_name, bank_account, hourly_rate')
        .eq('staff_role', staffRole),
      supabaseAdmin
        .from('roster_shifts')
        .select('id, start_time, end_time, break_minutes'),
    ])

    if (assignRes.error) return { success: false, error: assignRes.error.message }

    const staffMap = new Map((staffRes.data ?? []).map(s => [s.id, s]))
    const shiftMap = new Map((shiftRes.data ?? []).map(s => [s.id, s]))

    const totals = new Map<number, { days: number; minutes: number }>()
    for (const a of assignRes.data ?? []) {
      const shift = shiftMap.get(a.shift_id)
      if (!shift) continue
      // 팝업 이벤트 종료 후 남은 유령 배정은 급여 합계에서 제외 (fetchStaffMonthlyDetail과 동일 기준)
      const peRaw = a.popup_events
      const pe = (Array.isArray(peRaw) ? peRaw[0] : peRaw) as { start_date: string; end_date: string } | null
      if (pe && (a.work_date < pe.start_date || a.work_date > pe.end_date)) continue
      const startStr: string = a.start_time ?? shift.start_time
      const endStr: string = a.end_time ?? shift.end_time
      const paidMin = paidMinutes(startStr, endStr, a.break_minutes, shift.break_minutes)
      const prev = totals.get(a.staff_id) ?? { days: 0, minutes: 0 }
      totals.set(a.staff_id, { days: prev.days + 1, minutes: prev.minutes + paidMin })
    }

    return { success: true, data: buildPayrollRows(totals, staffMap) }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export interface PopupPayrollResult {
  popup: { id: number; name: string; startDate: string; endDate: string }
  rows: PayrollRow[]
}

// 팝업(행사) 단위 급여 집계 — 팝업 기간이 월 경계를 넘어가도(예: 8/21~9/3) 한 번에 정산할 때 사용.
// 캐셔 전용(주방은 popup_id가 없다) — roster_assignments.popup_id로 직접 필터링하므로 다른 팝업 배정이 섞일 여지가 없다.
export async function fetchPopupPayroll(popupId: number): Promise<ApiResponse<PopupPayrollResult>> {
  try {
    const user = await getAuthUser()
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return { success: false, error: '권한이 없습니다.' }

    const { data: popup, error: popupError } = await supabaseAdmin
      .from('popup_events')
      .select('id, name, start_date, end_date')
      .eq('id', popupId)
      .maybeSingle()
    if (popupError) return { success: false, error: popupError.message }
    if (!popup) return { success: false, error: '팝업을 찾을 수 없습니다.' }

    const [assignRes, staffRes, shiftRes] = await Promise.all([
      supabaseAdmin
        .from('roster_assignments')
        .select('staff_id, shift_id, start_time, end_time, break_minutes, work_date')
        .eq('popup_id', popupId),
      supabaseAdmin
        .from('staff_profiles')
        .select('id, name, phone, bank_name, bank_account, hourly_rate')
        .eq('staff_role', 'cashier'),
      supabaseAdmin
        .from('roster_shifts')
        .select('id, start_time, end_time, break_minutes'),
    ])

    if (assignRes.error) return { success: false, error: assignRes.error.message }

    const staffMap = new Map((staffRes.data ?? []).map(s => [s.id, s]))
    const shiftMap = new Map((shiftRes.data ?? []).map(s => [s.id, s]))

    const totals = new Map<number, { days: number; minutes: number }>()
    for (const a of assignRes.data ?? []) {
      const shift = shiftMap.get(a.shift_id)
      if (!shift) continue
      // 팝업 기간 밖 날짜로 남은 배정은 제외 (fetchStaffMonthlyDetail과 동일 기준의 방어 로직)
      if (a.work_date < popup.start_date || a.work_date > popup.end_date) continue
      const startStr: string = a.start_time ?? shift.start_time
      const endStr: string = a.end_time ?? shift.end_time
      const paidMin = paidMinutes(startStr, endStr, a.break_minutes, shift.break_minutes)
      const prev = totals.get(a.staff_id) ?? { days: 0, minutes: 0 }
      totals.set(a.staff_id, { days: prev.days + 1, minutes: prev.minutes + paidMin })
    }

    return {
      success: true,
      data: {
        popup: { id: popup.id, name: popup.name, startDate: popup.start_date, endDate: popup.end_date },
        rows: buildPayrollRows(totals, staffMap),
      },
    }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

// ────────────────────────────────────────────────────────────────
//  급여 정산 상태 (지급 완료 / 조정 항목) — 브라우저 localStorage 대신 DB에 보관해
//  기기를 바꾸거나 다른 관리자가 봐도 같은 상태가 보이고, 매달 다시 입력하지 않게 한다.
// ────────────────────────────────────────────────────────────────

/** 정산 구간 식별자 — 'month:2026-8'(month는 0-based) 또는 'popup:12' */
export type PayrollPeriodKey = string

export interface PayrollAdjustment {
  id: number
  label: string
  amount: number
}

export interface PayrollSettlement {
  paidStaffIds: number[]
  /** staffId → 조정 항목 목록 */
  adjustments: Record<number, PayrollAdjustment[]>
}

const PERIOD_KEY_RE = /^(month:\d{4}-(?:[0-9]|1[01])|popup:\d+)$/

function assertPeriodKey(key: string) {
  if (!PERIOD_KEY_RE.test(key)) throw new Error('잘못된 정산 구간입니다.')
}

/** 한 정산 구간의 지급 완료 + 조정 항목을 한 번에 조회 */
export async function fetchPayrollSettlement(periodKey: PayrollPeriodKey): Promise<ApiResponse<PayrollSettlement>> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    assertPeriodKey(periodKey)

    const [paidRes, adjRes] = await Promise.all([
      supabaseAdmin.from('payroll_payments').select('staff_id').eq('period_key', periodKey),
      supabaseAdmin.from('payroll_adjustments').select('id, staff_id, label, amount').eq('period_key', periodKey).order('id'),
    ])
    if (paidRes.error) throw new Error(paidRes.error.message)
    if (adjRes.error) throw new Error(adjRes.error.message)

    const adjustments: Record<number, PayrollAdjustment[]> = {}
    for (const a of adjRes.data ?? []) {
      (adjustments[a.staff_id] ??= []).push({ id: a.id, label: a.label, amount: a.amount })
    }
    return { paidStaffIds: (paidRes.data ?? []).map(p => p.staff_id), adjustments }
  })
}

export async function setPayrollPaid(periodKey: PayrollPeriodKey, staffId: number, paid: boolean): Promise<ApiResponse> {
  return wrap(async () => {
    const user = await requireManagerOrAdmin()
    assertPeriodKey(periodKey)

    if (paid) {
      // 같은 구간·직원 재체크는 unique 제약에 걸리므로 upsert로 멱등 처리
      const { error } = await supabaseAdmin
        .from('payroll_payments')
        .upsert({ period_key: periodKey, staff_id: staffId, paid_by: user.id }, { onConflict: 'period_key,staff_id' })
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabaseAdmin
        .from('payroll_payments').delete().eq('period_key', periodKey).eq('staff_id', staffId)
      if (error) throw new Error(error.message)
    }
  })
}

export async function addPayrollAdjustment(
  periodKey: PayrollPeriodKey, staffId: number, label: string, amount: number,
): Promise<ApiResponse<PayrollAdjustment>> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    assertPeriodKey(periodKey)
    const trimmed = label.trim()
    if (!trimmed) throw new Error('항목명을 입력해주세요.')
    if (!Number.isSafeInteger(amount)) throw new Error('금액은 정수만 입력할 수 있습니다.')

    const { data, error } = await supabaseAdmin
      .from('payroll_adjustments')
      .insert({ period_key: periodKey, staff_id: staffId, label: trimmed, amount })
      .select('id, label, amount')
      .single()
    if (error) throw new Error(error.message)

    // 같은 항목명·금액 조합을 프리셋으로 축적 — 다음 달엔 클릭 한 번으로 추가
    await supabaseAdmin
      .from('payroll_adjustment_presets')
      .upsert({ label: trimmed, amount }, { onConflict: 'label,amount', ignoreDuplicates: true })

    return data as PayrollAdjustment
  })
}

export async function removePayrollAdjustment(id: number): Promise<ApiResponse> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    const { error } = await supabaseAdmin.from('payroll_adjustments').delete().eq('id', id)
    if (error) throw new Error(error.message)
  })
}

export async function fetchAdjustmentPresets(): Promise<ApiResponse<{ id: number; label: string; amount: number }[]>> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    const { data, error } = await supabaseAdmin
      .from('payroll_adjustment_presets')
      .select('id, label, amount')
      .order('created_at', { ascending: false })
      .limit(12)
    if (error) throw new Error(error.message)
    return data ?? []
  })
}

export async function removeAdjustmentPreset(id: number): Promise<ApiResponse> {
  return wrap(async () => {
    await requireManagerOrAdmin()
    const { error } = await supabaseAdmin.from('payroll_adjustment_presets').delete().eq('id', id)
    if (error) throw new Error(error.message)
  })
}

// ────────────────────────────────────────────────────────────────
//  근로복지공단 단기간근로자 고용신고 서식 작성용 주민등록번호 열람 — admin 전용
// ────────────────────────────────────────────────────────────────
export async function fetchWelfareReportResidentId(staffId: number): Promise<ApiResponse<{ residentId: string | null }>> {
  return wrap(async () => {
    await requireAdmin()

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from('staff_profiles')
      .select('user_profile_id')
      .eq('id', staffId)
      .maybeSingle()
    if (staffErr) throw new Error(staffErr.message)
    if (!staff?.user_profile_id) return { residentId: null }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .select('resident_reg_no_enc')
      .eq('id', staff.user_profile_id)
      .maybeSingle()
    if (profileErr) throw new Error(profileErr.message)
    if (!profile?.resident_reg_no_enc) return { residentId: null }

    const residentId = decryptResidentId(profile.resident_reg_no_enc)

    return { residentId }
  })
}
