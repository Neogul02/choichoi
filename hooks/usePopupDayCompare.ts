'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchHourlySalesByPopup } from '@/app/actions/orders'
import { fetchPopupEvents } from '@/app/actions/schedule'
import { kstDayBounds, kstPartialHourBounds } from '@/lib/salesCurve'
import { queryKeys } from '@/lib/queryKeys'
import type { PopupEvent } from '@/types/database'
import type { TodayPopupSales } from '@/types/api'

/** 팝업 전체 목록(종료 포함) — 자주 바뀌지 않아 10분 캐시 */
export function usePopupEventsAll(enabled = true) {
  return useQuery<PopupEvent[]>({
    queryKey: queryKeys.popupEventsAll,
    queryFn: async () => {
      const res = await fetchPopupEvents()
      return res.success && res.data ? res.data : []
    },
    enabled,
    staleTime: 10 * 60_000,
  })
}

/**
 * 지난 팝업의 그날(date) 시간대 매출 + 진행 중인 시의 "정각~지금 분" 구간 — 어제·지난주 비교와 같은 규칙
 * (lib/salesCurve sumUptoMinute)으로 같은 시각까지 맞댄다. 끝난 날이라 하루치는 오래 캐시한다.
 */
export function usePopupDayCompare(date: string | null, hour: number, minute: number, enabled = true) {
  const full = useQuery<TodayPopupSales[]>({
    queryKey: queryKeys.popupDayCompare(date ?? ''),
    queryFn: async () => {
      const b = kstDayBounds(date!, 0)
      const res = await fetchHourlySalesByPopup(b.startISO, b.endISO)
      return res.success && res.data ? res.data : []
    },
    enabled: enabled && date != null,
    staleTime: 60 * 60_000,
  })
  const partial = useQuery<TodayPopupSales[]>({
    queryKey: queryKeys.popupDayCompareCurrentHour(date ?? '', hour, minute),
    queryFn: async () => {
      const b = kstPartialHourBounds(date!, 0, hour, minute)
      if (!b) return []
      const res = await fetchHourlySalesByPopup(b.startISO, b.endISO)
      return res.success && res.data ? res.data : []
    },
    enabled: enabled && date != null,
    staleTime: Infinity,
    gcTime: 2 * 60_000,
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === hour ? prev : undefined),
  })
  return { full: full.data ?? null, partial: partial.data ?? [] }
}
