'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '@/types/api'
import type { StaffRole } from '@/types/database'


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
): Promise<ApiResponse<StaffWorkAssignment[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, roster_shifts(name, start_time, end_time)')
      .eq('staff_id', staffId)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)
      .order('work_date', { ascending: true })

    if (error) return { success: false, error: error.message }

    const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']
    const results: StaffWorkAssignment[] = (data ?? []).map(a => {
      const shiftRaw = a.roster_shifts
      const shift = (Array.isArray(shiftRaw) ? shiftRaw[0] : shiftRaw) as { name: string; start_time: string; end_time: string } | null
      const d = new Date(a.work_date + 'T00:00:00')
      return {
        date: a.work_date,
        dayName: DAY_KO[d.getDay()],
        shiftName: shift?.name ?? '파트 미정',
        startTime: shift?.start_time ?? '00:00',
        endTime: shift?.end_time ?? '00:00',
      }
    })

    return { success: true, data: results }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
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
  /** 휴게 차감 분 — 7시간(420분) 이상 근무 시 60분 */
  breakMinutes: number
  /** 유급 분 — 월 합계는 이 값을 합산 후 시간 환산해야 fetchMonthlyPayroll과 일치 */
  paidMinutes: number
  /** 파트 기본 시간이 아닌 개별 수정 시간인지 */
  isCustomTime: boolean
}

export async function fetchStaffMonthlyDetail(
  staffId: number,
  year: number,
  month: number, // 0-indexed
): Promise<ApiResponse<StaffDayDetail[]>> {
  try {
    const pad = (n: number) => String(n).padStart(2, '0')
    const from = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`

    const { data, error } = await supabaseAdmin
      .from('roster_assignments')
      .select('work_date, shift_id, start_time, end_time, roster_shifts(name, start_time, end_time)')
      .eq('staff_id', staffId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: true })

    if (error) return { success: false, error: error.message }

    const details: StaffDayDetail[] = (data ?? []).map(a => {
      const shiftRaw = a.roster_shifts
      const shift = (Array.isArray(shiftRaw) ? shiftRaw[0] : shiftRaw) as { name: string; start_time: string; end_time: string } | null
      const startTime: string = a.start_time ?? shift?.start_time ?? '00:00'
      const endTime: string = a.end_time ?? shift?.end_time ?? '00:00'
      const rawMinutes = timeToMinutes(endTime) - timeToMinutes(startTime)
      const breakMinutes = rawMinutes >= 420 ? 60 : 0
      const paidMinutes = rawMinutes - breakMinutes
      const hours = Math.round(paidMinutes / 60 * 10) / 10
      return {
        date: a.work_date,
        shiftName: shift?.name ?? '파트 미정',
        startTime: startTime.slice(0, 5),
        endTime: endTime.slice(0, 5),
        hours,
        rawMinutes, breakMinutes, paidMinutes,
        isCustomTime: a.start_time != null || a.end_time != null,
      }
    })

    return { success: true, data: details }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function fetchMonthlyPayroll(
  staffRole: StaffRole,
  year: number,
  month: number, // 0-indexed
): Promise<ApiResponse<PayrollRow[]>> {
  try {
    const pad = (n: number) => String(n).padStart(2, '0')
    const from = `${year}-${pad(month + 1)}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${pad(month + 1)}-${pad(lastDay)}`

    const [assignRes, staffRes, shiftRes] = await Promise.all([
      supabaseAdmin
        .from('roster_assignments')
        .select('staff_id, shift_id, start_time, end_time')
        .eq('staff_role', staffRole)
        .gte('work_date', from)
        .lte('work_date', to),
      supabaseAdmin
        .from('staff_profiles')
        .select('id, name, phone, bank_name, bank_account, hourly_rate')
        .eq('staff_role', staffRole),
      supabaseAdmin
        .from('roster_shifts')
        .select('id, start_time, end_time'),
    ])

    if (assignRes.error) return { success: false, error: assignRes.error.message }

    const staffMap = new Map((staffRes.data ?? []).map(s => [s.id, s]))
    const shiftMap = new Map((shiftRes.data ?? []).map(s => [s.id, s]))

    const totals = new Map<number, { days: number; minutes: number }>()
    for (const a of assignRes.data ?? []) {
      const shift = shiftMap.get(a.shift_id)
      if (!shift) continue
      const startStr: string = a.start_time ?? shift.start_time
      const endStr: string = a.end_time ?? shift.end_time
      const rawMins = timeToMinutes(endStr) - timeToMinutes(startStr)
      const paidMin = rawMins >= 420 ? rawMins - 60 : rawMins
      const prev = totals.get(a.staff_id) ?? { days: 0, minutes: 0 }
      totals.set(a.staff_id, { days: prev.days + 1, minutes: prev.minutes + paidMin })
    }

    const rows: PayrollRow[] = []
    for (const [staffId, { days, minutes }] of totals) {
      const staff = staffMap.get(staffId)
      if (!staff) continue
      const totalHours = Math.round((minutes / 60) * 10) / 10
      const totalPay = staff.hourly_rate != null ? Math.round(totalHours * staff.hourly_rate) : null
      rows.push({ staffId, name: staff.name, phone: staff.phone, bankName: staff.bank_name ?? null, bankAccount: staff.bank_account ?? null, hourlyRate: staff.hourly_rate, days, totalHours, totalPay })
    }

    rows.sort((a, b) => b.totalHours - a.totalHours)
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
