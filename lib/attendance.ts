// 주방 출근부(키오스크)의 시각 규칙 — 찍힌 시각(timestamptz)을 근무표의 'HH:MM' 확정값으로 바꾸는 유일한 곳.
// 유급 분 계산 자체는 하지 않는다: 여기서 만든 시각을 배정 행에 쓰면 lib/workhours.ts가 그대로 계산한다.

import { hhmmToMinutes, shiftRawMinutes } from '@/lib/workhours'

/** 관리자 출근부 화면의 최근 기록 범위(일) */
export const ATTENDANCE_LOG_DAYS = 7

/** 퇴근 시 고를 수 있는 휴게(분) — 없음 / 30분 / 1시간 */
export const ATTENDANCE_BREAK_OPTIONS = [0, 30, 60] as const
export type AttendanceBreak = (typeof ATTENDANCE_BREAK_OPTIONS)[number]

export const isAttendanceBreak = (v: unknown): v is AttendanceBreak =>
  ATTENDANCE_BREAK_OPTIONS.includes(v as AttendanceBreak)

/**
 * 출근 후 이 시간 안에만 퇴근할 수 있다.
 * 자정을 넘겨 퇴근하는 날(오후 15:00 출근 → 00:30 퇴근)은 받아야 하지만, 퇴근을 잊은 기록이
 * 다음 날 출근 무렵까지 "근무 중"으로 남아 있으면 다음 날 출근하러 온 사람이 어제 기록을
 * 23시간짜리로 퇴근 처리하게 된다. 16시간이면 10:00 출근 기록은 새벽 02:00에 닫힌다.
 */
export const OPEN_WINDOW_HOURS = 16
const OPEN_WINDOW_MS = OPEN_WINDOW_HOURS * 3600 * 1000

const KST_OFFSET_MS = 9 * 3600 * 1000
const MINUTE_MS = 60 * 1000

/** 순간(ms) → KST 날짜 YYYY-MM-DD */
export function kstDateOf(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 순간(ms) → KST 'HH:MM' (초는 버린다) */
export function kstHHMMOf(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** 순간(ms) → KST 'HH:MM:SS' — 출근부 화면 표시용. 근무표에 쓰는 값은 kstHHMMOf(분 단위) */
export function kstHHMMSSOf(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 19)
}

/** 순간(ms) → KST 'YYYY/MM/DD' — 출근부 화면 표시용 */
export function kstSlashDateOf(ms: number): string {
  return kstDateOf(ms).replace(/-/g, '/')
}

/** KST 날짜 + 'HH:MM' → 순간(ms). '24:00'은 그 날의 끝(다음 날 00:00) */
export function kstInstant(date: string, hhmm: string): number {
  return Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS + hhmmToMinutes(hhmm) * MINUTE_MS
}

/** 아직 퇴근 처리할 수 있는 열린 기록인지 */
export function isWithinOpenWindow(clockInMs: number, nowMs: number): boolean {
  return nowMs - clockInMs < OPEN_WINDOW_MS
}

export type ClockOutResult =
  | { ok: true; startTime: string; endTime: string }
  | { ok: false; reason: 'before_start'; payStartTime: string }

/**
 * 퇴근 시 배정 행에 쓸 시작·종료 시각.
 *
 * - 시작 = max(실제 출근, 계획 시작). 계획보다 일찍 와도 계획 시각부터 인정한다(운영 방침).
 *   늦게 오면 실제 출근 시각부터.
 * - 종료 = 실제 퇴근.
 * - 둘 다 분 단위로 내림한다. 초 단위 차이로 시작·종료가 같은 'HH:MM'이 되면
 *   shiftRawMinutes가 이를 24시간 근무로 읽으므로(09:00~09:00 = 24h), 1분 미만 근무는 거부한다.
 *   같은 이유로 계획 시작 전에 퇴근하는 경우(09:48 출근 → 09:55 퇴근, 계획 10:00)도 거부한다.
 */
export function resolveClockOutTimes(input: {
  workDate: string
  clockInMs: number
  clockOutMs: number
  plannedStart: string | null
}): ClockOutResult {
  const plannedMs = input.plannedStart ? kstInstant(input.workDate, input.plannedStart) : -Infinity
  const payStartMs = Math.floor(Math.max(input.clockInMs, plannedMs) / MINUTE_MS) * MINUTE_MS
  const endMs = Math.floor(input.clockOutMs / MINUTE_MS) * MINUTE_MS
  if (endMs <= payStartMs) return { ok: false, reason: 'before_start', payStartTime: kstHHMMOf(payStartMs) }
  return { ok: true, startTime: kstHHMMOf(payStartMs), endTime: kstHHMMOf(endMs) }
}

/**
 * 근로기준법 54조 — 근로시간 4시간 이상이면 30분, 8시간 이상이면 1시간 이상 휴게.
 * 출근부는 고른 휴게를 그대로 기록하고(막지 않는다), 관리자 화면에 경고로만 띄운다.
 */
export function requiredBreakMinutes(start: string, end: string, breakMinutes: number): number {
  const worked = shiftRawMinutes(start, end) - breakMinutes
  if (worked >= 8 * 60) return 60
  if (worked >= 4 * 60) return 30
  return 0
}

export function isBreakShort(start: string, end: string, breakMinutes: number): boolean {
  return breakMinutes < requiredBreakMinutes(start, end, breakMinutes)
}

/** 근무일이 속한 월의 급여 정산 키 — payroll.ts의 PERIOD_KEY_RE와 같은 형식(월은 0부터) */
export function payrollMonthKey(workDate: string): string {
  return `month:${Number(workDate.slice(0, 4))}-${Number(workDate.slice(5, 7)) - 1}`
}
