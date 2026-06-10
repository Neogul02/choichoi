'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cheerWorker, getTodayCheers, resetTodayCheers } from '@/app/actions/cheers'

export function useCheers(popupId: string | null) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [milestoneKey, setMilestoneKey] = useState(0)
  const prevTotalRef = useRef(0)
  const countsRef = useRef<Record<string, number>>({})
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    countsRef.current = counts
  }, [counts])

  useEffect(() => {
    if (!popupId || popupId === '0') return () => {}

    getTodayCheers(Number(popupId)).then((data) => {
      setCounts(data)
      const total = Object.values(data).reduce((a, b) => a + b, 0)
      prevTotalRef.current = total
    })

    const ch = supabase
      .channel(`cheers-${popupId}`)
      .on('broadcast', { event: 'cheer_reset' }, () => {
        setCounts({})
        prevTotalRef.current = 0
      })
      .on('broadcast', { event: 'cheer_event' }, ({ payload }) => {
        const { workerName, count, total } = payload as {
          workerName: string
          count: number
          total: number
        }
        setCounts((prev) => ({ ...prev, [workerName]: count }))
        const prev30 = Math.floor(prevTotalRef.current / 30)
        const next30 = Math.floor(total / 30)
        if (next30 > prev30 && total > 0) setMilestoneKey((k) => k + 1)
        prevTotalRef.current = total
      })
      .subscribe()

    channelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
    }
  }, [popupId])

  const cheer = useCallback(
    async (workerName: string) => {
      if (!popupId || popupId === '0') return
      const result = await cheerWorker(Number(popupId), workerName)
      if (!result.success || result.count === undefined) return

      const updated = { ...countsRef.current, [workerName]: result.count }
      const newTotal = Object.values(updated).reduce((a, b) => a + b, 0)

      setCounts(updated)
      channelRef.current?.send({
        type: 'broadcast',
        event: 'cheer_event',
        payload: { workerName, count: result.count, total: newTotal },
      })

      const prev100 = Math.floor(prevTotalRef.current / 30)
      const next100 = Math.floor(newTotal / 30)
      if (next100 > prev100 && newTotal > 0) setMilestoneKey((k) => k + 1)
      prevTotalRef.current = newTotal
    },
    [popupId],
  )

  const reset = useCallback(async () => {
    if (!popupId || popupId === '0') return
    const result = await resetTodayCheers(Number(popupId))
    if (!result.success) return
    setCounts({})
    prevTotalRef.current = 0
    channelRef.current?.send({ type: 'broadcast', event: 'cheer_reset', payload: {} })
  }, [popupId])

  const totalToday = Object.values(counts).reduce((a, b) => a + b, 0)

  return { counts, cheer, reset, totalToday, milestoneKey }
}
