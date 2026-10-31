'use client'

import { useEffect, useState } from 'react'
import { kstNow } from '@/lib/date'

/** kstNow()는 KST 벽시계를 UTC 필드에 담아 돌려주므로 getUTCHours()가 곧 KST 시각이다 */
const currentKstMinuteOfDay = () => {
  const now = kstNow()
  return now.getUTCHours() * 60 + now.getUTCMinutes()
}

/**
 * 지금 KST 시·분. "같은 시각까지의 누적" 비교가 기준으로 쓴다 — 화면을 열어둔 채 시간이 흐르면
 * 비교 구간도 따라가야 한다. 15초마다 읽되 분이 바뀔 때만 다시 그린다(같은 숫자면 React가 건너뛴다).
 * 통계·POS '오늘 현황'이 같이 쓴다.
 */
export function useKstTime(): { hour: number; minute: number } {
  const [minuteOfDay, setMinuteOfDay] = useState(currentKstMinuteOfDay)
  useEffect(() => {
    const id = setInterval(() => setMinuteOfDay(currentKstMinuteOfDay()), 15_000)
    return () => clearInterval(id)
  }, [])
  return { hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 }
}
