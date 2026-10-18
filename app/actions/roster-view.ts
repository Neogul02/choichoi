'use server'

import type { ApiResponse } from '@/types/api'
import type { PopupClosedDay, StaffProfile } from '@/types/database'
import { fetchRosterRangeForOverview } from './roster'
import type { RosterMonthData, RosterUnit } from './roster'
import { fetchStaffProfiles } from './staff'
import { fetchPopupEvents, fetchPopupClosedDays } from './schedule'
import { extractErrorMessage, getAuthUser, isNextInternalControlFlowError } from './_base'

// 일정표는 매니저도 접근하는 화면이라 레이아웃 게이트만 믿지 않고 액션에서도 역할을 검사한다.
// 서버의 getSession()은 쿠키를 서명 검증 없이 읽으므로 검증된 클레임(getAuthUser)으로 판단한다.
async function getManagerSession() {
  const user = await getAuthUser()
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) return null
  return user
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
  /** 조회 기간에 걸친 팝업 휴무일 — 영업하지 않는 날을 "근무 없음"과 구분해 표시한다 */
  closedDays: PopupClosedDay[]
}

/** 주방 + 팝업별 캐셔 근무표를 한 번에 — 일정표(읽기 전용) 화면용 */
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

    const [staffRes, rangeResults, closedRes] = await Promise.all([
      fetchStaffProfiles(),
      Promise.all(unitDefs.map(u => fetchRosterRangeForOverview(u.unit, fromDate, toDate))),
      fetchPopupClosedDays(visiblePopups.map(p => p.id), fromDate, toDate),
    ])
    if (!staffRes.success || !staffRes.data) return { success: false, error: staffRes.error ?? '직원 목록을 불러올 수 없습니다.' }

    // 팝업 하나의 조회 실패가 나머지 정상 팝업까지 화면에서 가리지 않도록 — 실패한 유닛은 빈 데이터로 대체하고 계속 진행
    const units: RosterUnitOverview[] = unitDefs.map((def, i) => {
      const r = rangeResults[i]
      if (!r.success || !r.data) {
        console.error(`[fetchRosterOverview] ${def.label} 근무표 조회 실패: ${r.error}`)
        return { ...def, data: { shifts: [], assignments: [], requirements: [] } }
      }
      return { ...def, data: r.data }
    })

    return {
      success: true,
      data: {
        staff: staffRes.data,
        units,
        // 휴무일 조회 실패가 근무표 전체를 가리지 않도록 — 빈 목록이면 휴무 표시만 빠진다
        closedDays: closedRes.success && closedRes.data ? closedRes.data : [],
      },
    }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: extractErrorMessage(err) }
  }
}
