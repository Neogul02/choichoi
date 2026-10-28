import { NextResponse, type NextRequest } from 'next/server'
import { addDays, kstToday } from '@/lib/date'
import { ATTENDANCE_LAUNCH_DATE, ATTENDANCE_LOG_DAYS } from '@/lib/attendance'
import { queryMissingClockIns, queryStaleOpenRecords } from '@/lib/attendance-queries'
import { notifyDiscord } from '@/lib/discord'
import { formatTimeRange } from '@/lib/workhours'

// 매일 아침 09:00 KST(vercel.json crons) — 어제까지 출퇴근이 비어 급여가 계획값으로 잡힌 근무를 디스코드로 한 번 알린다.
// 출근부 화면을 열어야만 보이던 것을 놓치지 않게 하려는 것. 문제가 없으면 아무것도 보내지 않는다.
export async function GET(request: NextRequest) {
  // Vercel Cron은 CRON_SECRET이 설정돼 있으면 Authorization: Bearer <값>을 붙여 호출한다. 설정이 없으면 열지 않는다
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const yesterday = addDays(kstToday(), -1)
  const since = [addDays(yesterday, -(ATTENDANCE_LOG_DAYS - 1)), ATTENDANCE_LAUNCH_DATE].sort().at(-1)!
  // 미출근은 어제 하루만 — 그 전 날짜는 이미 지난 알림에 나갔다. 퇴근 누락은 정리될 때까지 매일 다시 알린다
  const [missing, stale] = yesterday < since
    ? [[], []]
    : await Promise.all([queryMissingClockIns(yesterday, yesterday), queryStaleOpenRecords(since, Date.now())])

  if (missing.length === 0 && stale.length === 0) return NextResponse.json({ sent: false })

  const fields: { name: string; value: string }[] = []
  if (stale.length > 0) {
    fields.push({
      name: `퇴근 누락 ${stale.length}건 — 근무표 계획값으로 계산 중`,
      value: stale.map(r => `${r.workDate.slice(5)} ${r.name} (출근 ${r.clockIn})`).join('\n').slice(0, 1024),
    })
  }
  if (missing.length > 0) {
    fields.push({
      name: `어제 출근 기록 없음 ${missing.length}건 — 결근이면 지워주세요`,
      value: missing.map(m => `${m.name}${m.plannedStart && m.plannedEnd ? ` (계획 ${formatTimeRange(m.plannedStart, m.plannedEnd)})` : ''}`)
        .join('\n').slice(0, 1024),
    })
  }
  await notifyDiscord('error', '🕘 출퇴근 확인 필요', '출근부 → 관리자 기록에서 결근 처리·시간 정정·기록 취소를 해주세요.', fields)
  return NextResponse.json({ sent: true, missing: missing.length, stale: stale.length })
}
