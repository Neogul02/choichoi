import { fetchAttendanceBoard, fetchAttendanceLog, fetchMissingClockIns } from '@/app/actions/attendance'
import { getAuthUser } from '@/app/actions/_base'
import { addDays, kstToday } from '@/lib/date'
import { ATTENDANCE_LOG_DAYS } from '@/lib/attendance'
import AttendanceClient from './AttendanceClient'

// 요청마다 오늘 기준으로 다시 조회 — 정적 프리렌더 방지
export const dynamic = 'force-dynamic'

// 접근 제한(admin | kiosk)은 proxy.ts가, 데이터 권한은 각 액션이 다시 검사한다
export default async function AttendancePage() {
  const user = await getAuthUser()
  const isAdmin = user?.role === 'admin'
  const today = kstToday()
  const from = addDays(today, -(ATTENDANCE_LOG_DAYS - 1))
  const [boardRes, logRes, missingRes] = await Promise.all([
    fetchAttendanceBoard(),
    isAdmin ? fetchAttendanceLog(from, today) : null,
    isAdmin ? fetchMissingClockIns(from, today) : null,
  ])
  return (
    <AttendanceClient
      initialBoard={boardRes.success && boardRes.data ? boardRes.data : null}
      initialLog={logRes?.success && logRes.data ? logRes.data : null}
      initialMissing={missingRes?.success && missingRes.data ? missingRes.data : []}
      isAdmin={isAdmin}
    />
  )
}
