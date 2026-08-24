import { getMyProfile, getMyOrderStats } from '@/app/actions/workers'
import { getMyContracts } from '@/app/actions/contracts'
import { getMyRoster, getMyCumulativeWorkedHours } from '@/app/actions/roster'
import { getMyStaffProfile, fetchStaffPickerList } from '@/app/actions/staff'
import { fetchStaffMonthlyDetail } from '@/app/actions/payroll'
import { kstToday } from '@/lib/date'
import MyPageClient, { type InitialMyData } from './MyPageClient'
import type { InitialSchedule } from './_components/ScheduleTab'

// 요청마다 세션 기반 조회 — 정적 프리렌더 방지
export const dynamic = 'force-dynamic'

// 프로필·주문 통계·계약서·근무표·누적 근무시간 + 일정 탭 데이터를 서버에서 병렬 프리페치 (hr 패턴).
// 일정 탭은 과거 /my/schedule 독립 라우트였던 것을 MY 페이지 안 탭으로 흡수한 것 — 실패 시 null로 클라이언트 폴백.
export default async function MyPage() {
  // 서버는 UTC로 돌 수 있으므로 KST 기준으로 이달을 계산 — 클라이언트(한국) 기준과 일치시킴
  const today = kstToday()
  const cursor = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }

  const [profileRes, statsRes, contractsRes, rosterRes, hoursRes, staffProfileRes, pickerRes] = await Promise.all([
    getMyProfile(),
    getMyOrderStats(),
    getMyContracts(),
    getMyRoster(),
    getMyCumulativeWorkedHours(),
    getMyStaffProfile(),
    fetchStaffPickerList(),
  ])
  if (!profileRes.success) return <MyPageClient initial={null} />

  const staffId = staffProfileRes.success ? staffProfileRes.data?.id ?? null : null
  const detailRes = staffId != null
    ? await fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m)
    : null

  const schedule: InitialSchedule | null = staffProfileRes.success
    ? {
        staffId,
        staffName: staffProfileRes.data?.name ?? '',
        shifts: rosterRes.success && rosterRes.data ? rosterRes.data.shifts : [],
        details: detailRes?.success && detailRes.data ? detailRes.data : [],
        cursor,
      }
    : null

  const initial: InitialMyData = {
    profile: profileRes.data ?? null,
    stats: statsRes.success ? statsRes.data ?? null : null,
    contracts: contractsRes.success ? contractsRes.data ?? [] : [],
    shifts: rosterRes.success && rosterRes.data ? rosterRes.data.shifts : null,
    cumulativeHours: hoursRes.success ? hoursRes.data?.totalHours ?? 0 : null,
    schedule,
    staffPicker: pickerRes.success && pickerRes.data ? pickerRes.data : null,
  }
  return <MyPageClient initial={initial} />
}
