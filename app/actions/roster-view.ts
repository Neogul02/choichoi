'use server'

import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { ApiResponse } from '@/types/api'
import type { RosterMemo, StaffProfile } from '@/types/database'
import { fetchRosterRange } from './roster'
import type { RosterMonthData, RosterUnit } from './roster'
import { fetchStaffProfiles } from './staff'
import { fetchPopupEvents } from './schedule'
import { extractErrorMessage } from './_base'


// 일정표는 매니저도 접근하는 화면이라 레이아웃 게이트만 믿지 않고 액션에서도 역할을 검사한다
async function getManagerSession() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  const role = session?.user?.user_metadata?.role
  if (!session || (role !== 'admin' && role !== 'manager')) return null
  return session
}

export interface RosterUnitOverview {
  key: string
  label: string
  unit: RosterUnit
  data: RosterMonthData
}

export interface RosterOverview {
  staff: StaffProfile[]
  units: RosterUnitOverview[]
  memos: RosterMemo[]
}

/** 주방 + 팝업별 캐셔 근무표와 기간 내 메모를 한 번에 — 일정표(읽기 전용) 화면용 */
export async function fetchRosterOverview(fromDate: string, toDate: string): Promise<ApiResponse<RosterOverview>> {
  try {
    if (!(await getManagerSession())) return { success: false, error: '권한이 없습니다.' }

    const popupsRes = await fetchPopupEvents()
    if (!popupsRes.success) return { success: false, error: popupsRes.error ?? '팝업을 불러올 수 없습니다.' }
    // 비활성 팝업은 일정표에서 제외
    const visiblePopups = (popupsRes.data ?? []).filter(p => p.is_active !== false)
    // 주방 매니저가 주 사용자라 주방을 맨 위에 표시
    const unitDefs: { key: string; label: string; unit: RosterUnit }[] = [
      { key: 'kitchen', label: '주방', unit: { staffRole: 'kitchen' as const, popupId: null } },
      ...visiblePopups.map(p => ({ key: `cashier-${p.id}`, label: p.name, unit: { staffRole: 'cashier' as const, popupId: p.id } })),
    ]

    const [staffRes, memosRes, rangeResults] = await Promise.all([
      fetchStaffProfiles(),
      supabaseAdmin
        .from('roster_memos')
        .select('*')
        .gte('memo_date', fromDate)
        .lte('memo_date', toDate)
        .order('memo_date')
        .order('created_at'),
      Promise.all(unitDefs.map(u => fetchRosterRange(u.unit, fromDate, toDate))),
    ])
    if (!staffRes.success || !staffRes.data) return { success: false, error: staffRes.error ?? '직원 목록을 불러올 수 없습니다.' }
    if (memosRes.error) return { success: false, error: memosRes.error.message }

    const units: RosterUnitOverview[] = []
    for (let i = 0; i < unitDefs.length; i++) {
      const r = rangeResults[i]
      if (!r.success || !r.data) return { success: false, error: r.error ?? `${unitDefs[i].label} 근무표를 불러올 수 없습니다.` }
      units.push({ ...unitDefs[i], data: r.data })
    }

    return {
      success: true,
      data: {
        staff: staffRes.data,
        units,
        memos: (memosRes.data ?? []) as RosterMemo[],
      },
    }
  } catch (err) {
    return { success: false, error: extractErrorMessage(err) }
  }
}

export async function createRosterMemo(memoDate: string, content: string): Promise<ApiResponse<RosterMemo>> {
  try {
    const session = await getManagerSession()
    if (!session) return { success: false, error: '권한이 없습니다.' }
    const trimmed = content.trim()
    if (!trimmed) return { success: false, error: '메모 내용을 입력하세요.' }
    if (trimmed.length > 500) return { success: false, error: '메모는 500자 이하여야 합니다.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(memoDate)) return { success: false, error: '날짜 형식이 올바르지 않습니다.' }

    // 작성자 이름: user_profiles → 계정 메타데이터 → 이메일 앞부분 순
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('name')
      .eq('id', session.user.id)
      .maybeSingle()
    const authorName = profile?.name ?? session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? null

    const { data, error } = await supabaseAdmin
      .from('roster_memos')
      .insert([{ memo_date: memoDate, content: trimmed, author_name: authorName }])
      .select('*')
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: data as RosterMemo }
  } catch (err) {
    return { success: false, error: extractErrorMessage(err) }
  }
}

export async function deleteRosterMemo(id: number): Promise<ApiResponse> {
  try {
    if (!(await getManagerSession())) return { success: false, error: '권한이 없습니다.' }
    const { error } = await supabaseAdmin.from('roster_memos').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: extractErrorMessage(err) }
  }
}
