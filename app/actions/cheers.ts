'use server'

import { incrementCheer, getTodayCheersByPopup } from '@/lib/supabase-admin'

export async function cheerWorker(
  popupId: number,
  workerName: string,
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const count = await incrementCheer(popupId, workerName)
    return { success: true, count }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function getTodayCheers(
  popupId: number,
): Promise<Record<string, number>> {
  try {
    const rows = await getTodayCheersByPopup(popupId)
    return Object.fromEntries(rows.map((r) => [r.worker_name, r.count]))
  } catch {
    return {}
  }
}
