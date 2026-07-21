import { getMyStaffProfile, fetchStaffPickerList } from '@/app/actions/staff'
import { getMyRoster } from '@/app/actions/roster'
import { fetchStaffMonthlyDetail } from '@/app/actions/payroll'
import MySchedulePageClient, { type InitialSchedule } from './MySchedulePageClient'
import { kstToday } from '@/lib/date'

// 요청마다 세션 기반 조회 — 정적 프리렌더 방지
export const dynamic = 'force-dynamic'

// 서버에서 프로필·근무표·이달 상세를 병렬 프리페치 (hr 패턴). 실패 시 null로 클라이언트 폴백.
export default async function MySchedulePage() {
  // 서버는 UTC로 돌 수 있으므로 KST 기준으로 이달을 계산 — 클라이언트(한국) 기준과 일치시킴
  const today = kstToday()
  const cursor = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }

  // fetchStaffPickerList는 관리자/매니저에게만 목록을 내려주므로, 실패(권한 없음)를 그대로
  // "일반 직원 — 선택기 숨김" 신호로 사용한다. 별도 역할 조회를 추가할 필요가 없다.
  const [profileRes, rosterRes, pickerRes] = await Promise.all([
    getMyStaffProfile(),
    getMyRoster(),
    fetchStaffPickerList(),
  ])
  if (!profileRes.success) return <MySchedulePageClient initial={null} staffPicker={null} />

  const staffId = profileRes.data?.id ?? null
  const detailRes = staffId != null
    ? await fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m)
    : null

  const initial: InitialSchedule = {
    staffId,
    staffName: profileRes.data?.name ?? '',
    shifts: rosterRes.success && rosterRes.data ? rosterRes.data.shifts : [],
    details: detailRes?.success && detailRes.data ? detailRes.data : [],
    cursor,
  }
  return (
    <MySchedulePageClient
      initial={initial}
      staffPicker={pickerRes.success && pickerRes.data ? pickerRes.data : null}
    />
  )
}
