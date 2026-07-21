'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from './_base'
import type { ApiResponse } from '@/types/api'
import type { StaffProfile, StaffStatus, StaffRole, AvailabilityRange } from '@/types/database'


export async function uploadHealthCert(staffId: number, file: FormData): Promise<ApiResponse<{ url: string }>> {
  try {
    const f = file.get('file') as File | null
    if (!f) return { success: false, error: '파일이 없습니다.' }
    const ext = f.name.split('.').pop() ?? 'jpg'
    const path = `staff/${staffId}/health_cert.${ext}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('health-certs')
      .upload(path, f, { upsert: true, contentType: f.type })
    if (uploadError) return { success: false, error: uploadError.message }
    const { data: signed } = await supabaseAdmin.storage
      .from('health-certs')
      .createSignedUrl(path, 60 * 60 * 24 * 365) // 1년
    if (!signed?.signedUrl) return { success: false, error: '서명 URL 생성 실패' }
    // staff_profiles에 저장 경로 기록
    const { error: dbError } = await supabaseAdmin
      .from('staff_profiles')
      .update({ health_cert_url: path, has_health_cert: true, updated_at: new Date().toISOString() })
      .eq('id', staffId)
    if (dbError) return { success: false, error: dbError.message }
    return { success: true, data: { url: signed.signedUrl } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function getHealthCertUrl(path: string): Promise<ApiResponse<{ url: string }>> {
  try {
    const { data } = await supabaseAdmin.storage
      .from('health-certs')
      .createSignedUrl(path, 60 * 60 * 2) // 2시간
    if (!data?.signedUrl) return { success: false, error: 'URL 생성 실패' }
    return { success: true, data: { url: data.signedUrl } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

const STAFF_COLUMNS = 'id, name, phone, bank_name, bank_account, staff_role, store_id, preferred_shift_ids, preferred_days, available_ranges, has_health_cert, health_cert_url, wants_insurance, hourly_rate, max_days_per_week, status, notes, user_profile_id, sort_order, created_at, updated_at'

export interface StaffProfileInput {
  name: string
  phone?: string | null
  bank_name?: string | null
  bank_account?: string | null
  staff_role: StaffRole
  store_id?: number | null
  preferred_shift_ids: number[]
  preferred_days: number[]
  available_ranges: AvailabilityRange[]
  has_health_cert: boolean
  health_cert_url?: string | null
  wants_insurance: boolean
  hourly_rate?: number | null
  max_days_per_week?: number | null
  status: StaffStatus
  notes?: string | null
  user_profile_id?: string | null
}

export interface StaffPickerItem {
  id: number
  name: string
  staff_role: StaffRole
  status: StaffStatus
}

// 관리자가 '스케줄' 탭에서 다른 직원의 근무표를 조회할 대상을 고르는 목록 — 급여/연락처 등 민감 정보는 제외
export async function fetchStaffPickerList(): Promise<ApiResponse<StaffPickerItem[]>> {
  try {
    const user = await getAuthUser()
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return { success: false, error: '권한이 없습니다.' }
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, name, staff_role, status')
      .eq('status', 'confirmed')
      .order('sort_order', { ascending: true })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as StaffPickerItem[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function fetchStaffProfiles(): Promise<ApiResponse<StaffProfile[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select(STAFF_COLUMNS)
      .order('sort_order', { ascending: true })
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as StaffProfile[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function updateStaffOrder(updates: { id: number; sort_order: number }[]): Promise<ApiResponse> {
  try {
    await Promise.all(updates.map(({ id, sort_order }) =>
      supabaseAdmin.from('staff_profiles').update({ sort_order }).eq('id', id)
    ))
    return { success: true }
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
        bank_name: input.bank_name?.trim() || null,
        bank_account: input.bank_account?.trim() || null,
        staff_role: input.staff_role,
        store_id: input.staff_role === 'cashier' ? (input.store_id ?? null) : null,
        preferred_shift_ids: input.preferred_shift_ids,
        preferred_days: input.preferred_days,
        available_ranges: input.available_ranges,
        has_health_cert: input.has_health_cert,
        health_cert_url: input.health_cert_url ?? null,
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
        bank_name: input.bank_name?.trim() || null,
        bank_account: input.bank_account?.trim() || null,
        staff_role: input.staff_role,
        store_id: input.staff_role === 'cashier' ? (input.store_id ?? null) : null,
        preferred_shift_ids: input.preferred_shift_ids,
        preferred_days: input.preferred_days,
        available_ranges: input.available_ranges,
        has_health_cert: input.has_health_cert,
        health_cert_url: input.health_cert_url ?? null,
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

export async function getStaffById(staffId: number): Promise<ApiResponse<StaffProfile | null>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select(STAFF_COLUMNS)
      .eq('id', staffId)
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as StaffProfile | null }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function getMyStaffProfile(): Promise<ApiResponse<StaffProfile | null>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }
    const { data, error } = await supabaseAdmin
      .from('staff_profiles')
      .select(STAFF_COLUMNS)
      .eq('user_profile_id', user.id)
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as StaffProfile | null }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
