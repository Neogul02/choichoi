import { NextResponse } from 'next/server'
import { fetchTomorrowRosterDigest } from '@/app/actions/roster'
import { notifyDiscord } from '@/lib/discord'

// Vercel Cron이 매일 09:00 UTC(KST 18:00)에 GET으로 호출한다 (vercel.json 참고)
export async function GET(request: Request) {
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { dateLabel, shifts } = await fetchTomorrowRosterDigest()

  if (shifts.length === 0) {
    await notifyDiscord('add', `📋 ${dateLabel} 근무 안내`, '배정된 근무자가 없습니다.')
  } else {
    await notifyDiscord(
      'add',
      `📋 ${dateLabel} 근무 안내`,
      '내일 근무 배정입니다.',
      shifts.map(s => ({
        name: `[${s.shiftName}] ${s.startTime}~${s.endTime}`,
        value: s.names.map(n => `· ${n}`).join('\n'),
      })),
    )
  }

  return NextResponse.json({ ok: true, dateLabel, shiftCount: shifts.length })
}
