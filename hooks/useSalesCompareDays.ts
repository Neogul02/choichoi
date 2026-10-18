'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchHourlySalesByPopup } from '@/app/actions/orders'
import { kstDayBounds } from '@/lib/salesCurve'
import { queryKeys } from '@/lib/queryKeys'
import type { TodayPopupSales } from '@/types/api'

export interface SalesCompareDays {
  yesterday: TodayPopupSales[]
  lastWeek: TodayPopupSales[]
}

/**
 * 비교 기준일(어제·지난주 같은 요일)의 팝업별 시간대 매출 — 통계탭 '오늘 현황'과 POS '오늘 현황'이 같이 쓴다.
 * 두 화면이 각자 조회하던 것을 한 캐시로 합쳤다. 기준일은 이미 끝난 날이라 한 시간에 한 번이면 충분하고,
 * `today`를 키에 넣어 자정을 넘기면 새로 받는다.
 * 비교는 보조 정보다 — 실패해도 화면을 막지 않고 빈 배열(비교 생략)로 둔다.
 */
export function useSalesCompareDays(today: string, enabled = true) {
  return useQuery<SalesCompareDays>({
    queryKey: queryKeys.salesCompareDays(today),
    queryFn: async () => {
      const y = kstDayBounds(today, -1)
      const w = kstDayBounds(today, -7)
      const [yRes, wRes] = await Promise.all([
        fetchHourlySalesByPopup(y.startISO, y.endISO),
        fetchHourlySalesByPopup(w.startISO, w.endISO),
      ])
      return {
        yesterday: yRes.success && yRes.data ? yRes.data : [],
        lastWeek: wRes.success && wRes.data ? wRes.data : [],
      }
    },
    enabled,
    staleTime: 60 * 60_000,
  })
}
