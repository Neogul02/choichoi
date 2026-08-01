// 근무시간·유급시간 계산의 단일 기준 — 급여정산(payroll.ts)·근무표(roster.ts)·
// 인원별 합계(StaffTotalsPanel)·직원 예상급여가 전부 이 함수를 쓴다.
// 규칙이 바뀌면 반드시 여기만 고칠 것: 흩어진 복사본이 생기면 화면마다 금액이 달라진다.

/** 급여 계산용 기본 휴게시간(분) — 근무일별 오버라이드(break_minutes)가 없을 때 적용 */
export const DEFAULT_BREAK_MINUTES = 60

/** "HH:MM" 또는 "HH:MM:SS" → 분. DB time 컬럼의 초 단위는 무시한다 */
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** 출근~퇴근 실근무 분 — 자정을 넘기는 야간 근무(end < start)는 +24h로 보정 */
export function shiftRawMinutes(start: string, end: string): number {
  let mins = hhmmToMinutes(end) - hhmmToMinutes(start)
  if (mins < 0) mins += 24 * 60
  return mins
}

/** 유급 분 = 실근무 − 휴게(오버라이드 없으면 기본 1시간), 음수 방지 */
export function paidMinutes(start: string, end: string, breakOverride: number | null | undefined): number {
  return Math.max(0, shiftRawMinutes(start, end) - (breakOverride ?? DEFAULT_BREAK_MINUTES))
}

/** 분 → 시간, 0.1h 단위 반올림. 합계는 분을 모두 더한 뒤 마지막에 한 번만 이 함수를 거칠 것 */
export function minutesToHours(min: number): number {
  return Math.round(min / 60 * 10) / 10
}
