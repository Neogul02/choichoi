'use client'

import { useEffect, useState } from 'react'
import { kstNow } from '@/lib/date'

/** kstNow()는 KST 벽시계를 UTC 필드에 담아 돌려주므로 getUTCHours()가 곧 KST 시각이다 */
const currentKstHour = () => kstNow().getUTCHours()

/**
 * 지금 KST 시(0-23). "같은 시각까지의 누적" 비교가 기준으로 쓴다 — 화면을 열어둔 채 시간이 넘어가면
 * 비교 구간도 따라가야 하므로 1분마다 다시 읽는다. 통계·POS '오늘 현황'이 같이 쓴다.
 */
export function useKstHour(): number {
  const [hour, setHour] = useState(currentKstHour)
  useEffect(() => {
    const id = setInterval(() => setHour(currentKstHour()), 60_000)
    return () => clearInterval(id)
  }, [])
  return hour
}
