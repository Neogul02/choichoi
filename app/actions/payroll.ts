'use server'

import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '@/types/api'
import type { StaffRole } from '@/types/database'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export interface PayrollRow {
  staffId: number
  name: string
  phone: string | null
  hourlyRate: number | null
  days: number
  totalHours: number
  totalPay: number | null
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
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
        .select('id, name, phone, hourly_rate')
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
      const minutes = timeToMinutes(endStr) - timeToMinutes(startStr)
      const prev = totals.get(a.staff_id) ?? { days: 0, minutes: 0 }
      totals.set(a.staff_id, { days: prev.days + 1, minutes: prev.minutes + minutes })
    }

    const rows: PayrollRow[] = []
    for (const [staffId, { days, minutes }] of totals) {
      const staff = staffMap.get(staffId)
      if (!staff) continue
      const totalHours = Math.round((minutes / 60) * 10) / 10
      const totalPay = staff.hourly_rate != null ? Math.round(totalHours * staff.hourly_rate) : null
      rows.push({ staffId, name: staff.name, phone: staff.phone, hourlyRate: staff.hourly_rate, days, totalHours, totalPay })
    }

    rows.sort((a, b) => b.totalHours - a.totalHours)
    return { success: true, data: rows }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
