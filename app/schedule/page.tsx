import { getMyStaffProfile, fetchStaffPickerList } from '@/app/actions/staff'
import { fetchStaffMonthlyDetail, fetchStaffPayEstimateInfo } from '@/app/actions/payroll'
import { kstToday } from '@/lib/date'
import ScheduleClient, { type InitialSchedule } from './ScheduleClient'

// 요청마다 세션 기반 조회 — 정적 프리렌더 방지
export const dynamic = 'force-dynamic'

// 근무자 프로필·이달 상세·예상 급여 정보·직원 선택기를 서버에서 병렬 프리페치 (hr 패턴) — 실패 시 null로 클라이언트 폴백.
export default async function SchedulePage() {
  // 서버는 UTC로 돌 수 있으므로 KST 기준으로 이달을 계산 — 클라이언트(한국) 기준과 일치시킴
  const today = kstToday()
  const cursor = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }

  const [staffProfileRes, pickerRes] = await Promise.all([
    getMyStaffProfile(),
    fetchStaffPickerList(),
  ])

  const staffId = staffProfileRes.success ? staffProfileRes.data?.id ?? null : null
  const [detailRes, payRes] = staffId != null
    ? await Promise.all([
        fetchStaffMonthlyDetail(staffId, cursor.y, cursor.m),
        fetchStaffPayEstimateInfo(staffId, cursor.y, cursor.m),
      ])
    : [null, null]

  const initial: InitialSchedule | null = staffProfileRes.success
    ? {
        staffId,
        staffName: staffProfileRes.data?.name ?? '',
        details: detailRes?.success && detailRes.data ? detailRes.data : [],
        payInfo: payRes?.success && payRes.data ? payRes.data : null,
        cursor,
      }
    : null

  return (
    <ScheduleClient
      initial={initial}
      staffPicker={pickerRes.success && pickerRes.data ? pickerRes.data : null}
    />
  )
}
