import type { RosterShift, StaffProfile } from '@/types/database'
import { getWeekStart, toMinutes, MIN_REST_MINUTES } from '@/lib/staffing'
import { parseDate, prevDate, dayOfWeek, dayGroup } from '@/lib/date'
import type { RosterUnit, AutoFillLogEntry, AutoFillResult } from '@/app/actions/roster'

export type InsertRow = { work_date: string; shift_id: number; staff_id: number; staff_role: RosterUnit['staffRole']; popup_id: number | null }

export interface GreedyCtx {
  dates: string[]
  shifts: RosterShift[]
  shiftById: Map<number, RosterShift>
  getRequired: (dateStr: string, shift: RosterShift) => number
  filledCount: Map<string, number>
  assignedByDate: Map<string, Set<number>>
  workload: Map<number, number>
  weeklyCount: Map<string, number>
  groupLoad: Map<string, number>
  staffEndByDate: Map<string, string>
  unit: RosterUnit
}

// 연속성 점수: 고립된 근무일(앞뒤 모두 비근무) 개수 — 낮을수록 좋음
export function scoreInserts(
  newInserts: { work_date: string; staff_id: number }[],
  existing: { work_date: string; staff_id: number }[],
  fromDate: string,
  toDate: string,
): number {
  const byStaff = new Map<number, Set<string>>()
  for (const a of existing.filter(a => a.work_date >= fromDate && a.work_date <= toDate)) {
    if (!byStaff.has(a.staff_id)) byStaff.set(a.staff_id, new Set())
    byStaff.get(a.staff_id)!.add(a.work_date)
  }
  for (const ins of newInserts) {
    if (!byStaff.has(ins.staff_id)) byStaff.set(ins.staff_id, new Set())
    byStaff.get(ins.staff_id)!.add(ins.work_date)
  }
  let score = 0
  for (const [, dateSet] of byStaff) {
    const sorted = [...dateSet].sort()
    for (let i = 0; i < sorted.length; i++) {
      const prev = i > 0 ? sorted[i - 1] : null
      const next = i < sorted.length - 1 ? sorted[i + 1] : null
      const prevGap = prev ? Math.round((parseDate(sorted[i]).getTime() - parseDate(prev).getTime()) / 86400000) : 99
      const nextGap = next ? Math.round((parseDate(next).getTime() - parseDate(sorted[i]).getTime()) / 86400000) : 99
      if (prevGap > 1 && nextGap > 1) score++
    }
  }
  return score
}

// 결정적 셔플 (LCG 시드)
export function shuffleStaff(arr: StaffProfile[], seed: number): StaffProfile[] {
  const result = [...arr]
  let s = (seed + 1) * 1664525 + 1013904223
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    const j = Math.abs(s) % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function runGreedy(staffList: StaffProfile[], ctx: GreedyCtx): { inserts: InsertRow[]; holes: AutoFillResult['holes']; log: AutoFillLogEntry[] } {
  const { dates, shifts, shiftById, getRequired, unit } = ctx
  // 후보별 독립 실행을 위해 가변 상태 복사
  const fc = new Map(ctx.filledCount)
  const abd = new Map([...ctx.assignedByDate].map(([k, v]) => [k, new Set(v)]))
  const wl = new Map(ctx.workload)
  const wc = new Map(ctx.weeklyCount)
  const gl = new Map(ctx.groupLoad)
  const sed = new Map(ctx.staffEndByDate)

  const inserts: InsertRow[] = []
  const holes: AutoFillResult['holes'] = []
  const log: AutoFillLogEntry[] = []

  for (const dateStr of dates) {
    const dayAssigned = abd.get(dateStr) ?? new Set<number>()
    const weekStart = getWeekStart(dateStr)
    const prevAssigned = abd.get(prevDate(dateStr))
    const day = dayOfWeek(dateStr)
    const grp = dayGroup(dateStr)

    const isAvailable = (s: StaffProfile, shiftId: number) => {
      if (dayAssigned.has(s.id)) return false
      if (s.max_days_per_week != null && (wc.get(`${s.id}|${weekStart}`) ?? 0) >= s.max_days_per_week) return false
      if (s.available_ranges.length > 0 && !s.available_ranges.some(r => r.from <= dateStr && dateStr <= r.to)) return false
      if (s.preferred_shift_ids.length > 0 && !s.preferred_shift_ids.includes(shiftId)) return false
      const prevEnd = sed.get(`${prevDate(dateStr)}|${s.id}`)
      const todayShift = shiftById.get(shiftId)
      if (prevEnd && todayShift && toMinutes(todayShift.start_time) + 24 * 60 - toMinutes(prevEnd) < MIN_REST_MINUTES) return false
      return true
    }

    // 가능 인원이 적은 파트 우선
    const pendingShifts = shifts
      .map(shift => {
        if (shift.active_from && dateStr < shift.active_from) return null
        if (shift.active_to && dateStr > shift.active_to) return null
        const required = getRequired(dateStr, shift)
        const filled = fc.get(`${dateStr}|${shift.id}`) ?? 0
        if (filled >= required) return null
        const eligibleCount = staffList.filter(s => isAvailable(s, shift.id)).length
        return { shift, required, eligibleCount }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.eligibleCount - b.eligibleCount)

    for (const { shift, required } of pendingShifts) {
      let filled = fc.get(`${dateStr}|${shift.id}`) ?? 0

      const eligible = staffList
        .filter(s => isAvailable(s, shift.id))
        .sort((a, b) => {
          // 그룹 부하 ±1 버킷 안에서 스트릭 우선 → 연속 블록 형성
          const aGrpBucket = Math.floor((gl.get(`${a.id}|${grp}`) ?? 0) / 2)
          const bGrpBucket = Math.floor((gl.get(`${b.id}|${grp}`) ?? 0) / 2)
          const aStreak = prevAssigned?.has(a.id) ? 0 : 1
          const bStreak = prevAssigned?.has(b.id) ? 0 : 1
          const aDayPref = a.preferred_days.length === 0 || a.preferred_days.includes(day) ? 0 : 1
          const bDayPref = b.preferred_days.length === 0 || b.preferred_days.includes(day) ? 0 : 1
          const aGroupLoad = gl.get(`${a.id}|${grp}`) ?? 0
          const bGroupLoad = gl.get(`${b.id}|${grp}`) ?? 0
          const aLoad = wl.get(a.id) ?? 0
          const bLoad = wl.get(b.id) ?? 0
          const aShiftPref = a.preferred_shift_ids.length === 0 || a.preferred_shift_ids.includes(shift.id) ? 0 : 1
          const bShiftPref = b.preferred_shift_ids.length === 0 || b.preferred_shift_ids.includes(shift.id) ? 0 : 1
          return aGrpBucket - bGrpBucket || aStreak - bStreak || aDayPref - bDayPref || aGroupLoad - bGroupLoad || aLoad - bLoad || aShiftPref - bShiftPref || a.id - b.id
        })

      const names: string[] = []
      for (const s of eligible) {
        if (filled >= required) break
        inserts.push({ work_date: dateStr, shift_id: shift.id, staff_id: s.id, staff_role: unit.staffRole, popup_id: unit.popupId })
        names.push(s.name)
        filled++
        dayAssigned.add(s.id)
        wl.set(s.id, (wl.get(s.id) ?? 0) + 1)
        wc.set(`${s.id}|${weekStart}`, (wc.get(`${s.id}|${weekStart}`) ?? 0) + 1)
        const gk = `${s.id}|${grp}`
        gl.set(gk, (gl.get(gk) ?? 0) + 1)
        sed.set(`${dateStr}|${s.id}`, shift.end_time)
      }
      if (names.length > 0) log.push({ date: dateStr, shiftName: shift.name, names })
      if (filled < required) holes.push({ date: dateStr, shiftName: shift.name, missing: required - filled })
    }

    abd.set(dateStr, dayAssigned)
  }

  return { inserts, holes, log }
}
