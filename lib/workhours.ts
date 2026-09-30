// 근무시간·유급시간 계산의 단일 기준 — 급여정산(payroll.ts)·근무표(roster.ts)·
// 인원별 합계(StaffTotalsPanel)·직원 예상급여가 전부 이 함수를 쓴다.
// 규칙이 바뀌면 반드시 여기만 고칠 것: 흩어진 복사본이 생기면 화면마다 금액이 달라진다.

/** 급여 계산용 기본 휴게시간(분) — 파트에도 근무일에도 설정이 없을 때 적용 */
export const DEFAULT_BREAK_MINUTES = 60

/** 하루 = 1440분. 시간대는 오전/오후로 나누지 않고 00:00~24:00 한 축 위에서 다룬다 */
export const MINUTES_IN_DAY = 24 * 60

/** "HH:MM" 또는 "HH:MM:SS" → 분. DB time 컬럼의 초 단위는 무시한다. "24:00"은 1440 */
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** 분 → "HH:MM". 1440은 "24:00"으로, 그 이상(익일)은 24를 빼고 표기한다 */
export function minutesToHHMM(min: number): string {
  const capped = min > MINUTES_IN_DAY ? min - MINUTES_IN_DAY : min
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}:${String(capped % 60).padStart(2, '0')}`
}

/**
 * 출근~퇴근 실근무 분.
 * 종료가 시작보다 이르거나 같으면 자정을 넘긴 것으로 본다 —
 * 00:00~00:00, 09:00~09:00 처럼 같은 시각이면 길이 0이 아니라 24시간 근무다.
 * (00:00~24:00 처럼 end가 명시적으로 24:00이면 그대로 1440분)
 */
export function shiftRawMinutes(start: string, end: string): number {
  let mins = hhmmToMinutes(end) - hhmmToMinutes(start)
  if (mins <= 0) mins += MINUTES_IN_DAY
  return mins
}

/** 자정을 넘겨 다음 날 끝나는 근무인지 — 24시간 종일 근무는 자정을 "넘는" 게 아니라 하루를 꽉 채운 것으로 본다 */
export function crossesMidnight(start: string, end: string): boolean {
  const s = hhmmToMinutes(start)
  const e = hhmmToMinutes(end)
  if (e === MINUTES_IN_DAY) return false // 24:00은 그날의 끝
  return e <= s
}

/** 24시간을 통째로 쓰는 근무인지 (00:00~24:00, 또는 시작=종료로 표현된 24시간) */
export function isFullDay(start: string, end: string): boolean {
  return shiftRawMinutes(start, end) === MINUTES_IN_DAY
}

/**
 * 화면·복사 문구에 쓰는 시간대 표기.
 * 오전/오후 구분 없이 00:00~24:00 축으로 읽히도록, 자정을 넘기면 (익일)을 붙이고
 * 하루 전체면 00:00~24:00으로 통일해 보여준다.
 */
export function formatTimeRange(start: string, end: string): string {
  const s = start.slice(0, 5)
  const e = end.slice(0, 5)
  if (isFullDay(start, end)) return '00:00~24:00'
  return crossesMidnight(start, end) ? `${s}~${e} (익일)` : `${s}~${e}`
}

/**
 * 실제로 차감할 휴게 분 — 우선순위는 근무일별 오버라이드 > 파트 고정 휴게 > 기본 1시간.
 *
 * roster_shifts.break_minutes는 NOT NULL DEFAULT 0이라 "휴게 없음"과 "설정 안 함"을 구분하지 못한다.
 * 파트관리 화면도 0이면 휴게 표기를 아예 숨기므로(ShiftManageModal), 0은 "미설정"으로 읽고 기본값으로 넘긴다.
 * 특정 근무일만 휴게 없이 계산하려면 근무일별 오버라이드(roster_assignments.break_minutes = 0)를 쓴다.
 */
export function resolveBreakMinutes(
  assignmentBreak: number | null | undefined,
  shiftBreak: number | null | undefined,
): number {
  if (assignmentBreak != null) return assignmentBreak
  if (shiftBreak != null && shiftBreak > 0) return shiftBreak
  return DEFAULT_BREAK_MINUTES
}

/**
 * 유급 분 = 실근무 − 휴게(resolveBreakMinutes 기준), 음수 방지.
 * shiftBreak는 생략하지 말 것 — 빠뜨리면 파트에 설정한 휴게시간이 조용히 무시되고 기본 1시간이 차감된다.
 */
export function paidMinutes(
  start: string,
  end: string,
  assignmentBreak: number | null | undefined,
  shiftBreak: number | null | undefined,
): number {
  return Math.max(0, shiftRawMinutes(start, end) - resolveBreakMinutes(assignmentBreak, shiftBreak))
}

/** 분 → 시간, 0.1h 단위 반올림. 합계는 분을 모두 더한 뒤 마지막에 한 번만 이 함수를 거칠 것 */
export function minutesToHours(min: number): number {
  return Math.round(min / 60 * 10) / 10
}
