'use server'

import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '@/types/api'
import type { StaffProfile, StaffStatus, StaffRole, AvailabilityRange } from '@/types/database'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const STAFF_COLUMNS = 'id, name, phone, staff_role, store_id, preferred_shift_ids, preferred_days, available_ranges, has_health_cert, wants_insurance, hourly_rate, max_days_per_week, status, notes, user_profile_id, created_at, updated_at'

export interface StaffProfileInput {
  name: string
  phone?: string | null
  staff_role: StaffRole
  store_id?: number | null
  preferred_shift_ids: number[]
  preferred_days: number[]
  available_ranges: AvailabilityRange[]
  has_health_cert: boolean
  wants_insurance: boolean
  hourly_rate?: number | null
  max_days_per_week?: number | null
  status: StaffStatus
  notes?: string | null
  user_profile_id?: string | null
}

export async function fetchStaffProfiles(): Promise<ApiResponse<StaffProfile[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select(STAFF_COLUMNS)
      .order('created_at', { ascending: false })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as StaffProfile[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function createStaffProfile(input: StaffProfileInput): Promise<ApiResponse<StaffProfile>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .insert([{
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        staff_role: input.staff_role,
        store_id: input.staff_role === 'cashier' ? (input.store_id ?? null) : null,
        preferred_shift_ids: input.preferred_shift_ids,
        preferred_days: input.preferred_days,
        available_ranges: input.available_ranges,
        has_health_cert: input.has_health_cert,
        wants_insurance: input.wants_insurance,
        hourly_rate: input.hourly_rate ?? null,
        max_days_per_week: input.max_days_per_week ?? null,
        status: input.status,
        notes: input.notes?.trim() || null,
        user_profile_id: input.user_profile_id ?? null,
      }])
      .select(STAFF_COLUMNS)
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as StaffProfile }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateStaffProfile(id: number, input: StaffProfileInput): Promise<ApiResponse<StaffProfile>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        staff_role: input.staff_role,
        store_id: input.staff_role === 'cashier' ? (input.store_id ?? null) : null,
        preferred_shift_ids: input.preferred_shift_ids,
        preferred_days: input.preferred_days,
        available_ranges: input.available_ranges,
        has_health_cert: input.has_health_cert,
        wants_insurance: input.wants_insurance,
        hourly_rate: input.hourly_rate ?? null,
        max_days_per_week: input.max_days_per_week ?? null,
        status: input.status,
        notes: input.notes?.trim() || null,
        user_profile_id: input.user_profile_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(STAFF_COLUMNS)
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as StaffProfile }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateStaffStatus(id: number, status: StaffStatus): Promise<ApiResponse<StaffProfile>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(STAFF_COLUMNS)
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as StaffProfile }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function deleteStaffProfile(id: number): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin.from('staff_profiles').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
