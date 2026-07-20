'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '@/types/api'
import type { Store } from '@/types/database'


export async function fetchStores(): Promise<ApiResponse<Store[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .order('sort_order')
      .order('created_at')
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as Store[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function createStore(name: string): Promise<ApiResponse<Store>> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { success: false, error: '매장 이름을 입력하세요.' }
    const { data, error } = await supabaseAdmin
      .from('stores')
      .insert([{ name: trimmed }])
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') return { success: false, error: '이미 등록된 매장 이름입니다.' }
      return { success: false, error: error.message }
    }
    return { success: true, data: data as Store }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function renameStore(id: number, name: string): Promise<ApiResponse<Store>> {
  try {
    const trimmed = name.trim()
    if (!trimmed) return { success: false, error: '매장 이름을 입력하세요.' }
    const { data, error } = await supabaseAdmin
      .from('stores')
      .update({ name: trimmed })
      .eq('id', id)
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as Store }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** 매장 삭제 — 배속된 캐셔는 미배정으로, 해당 매장의 스케줄 데이터는 함께 삭제된다 */
export async function deleteStore(id: number): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin.from('stores').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
