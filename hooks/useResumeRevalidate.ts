'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * 모바일에서 앱을 백그라운드에 뒀다 돌아오면 realtime 이벤트를 놓쳐 stale 데이터가 남는다.
 * 전역 refetchOnWindowFocus는 데스크톱 탭 전환마다 재조회를 유발해 꺼둔 상태이므로,
 * "일정 시간 이상 백그라운드였다가 복귀"와 "네트워크 회복" 두 경우에만 전체 무효화한다.
 * (supabase realtime 채널은 소켓 재연결 시 자동 rejoin되므로 놓친 기간의 데이터만 채우면 된다)
 */
const MIN_HIDDEN_MS = 60 * 1000

export function useResumeRevalidate() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let hiddenAt: number | null = null

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_MS) {
        queryClient.invalidateQueries()
      }
      hiddenAt = null
    }

    const onOnline = () => { queryClient.invalidateQueries() }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
    }
  }, [queryClient])
}
