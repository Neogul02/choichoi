// 국민연금 사업장가입자 판정 — 급여정산(월별)에서 "이 달 가입 대상인가"의 유일한 기준.
//
// 한 달 안에서 아래 중 하나라도 충족하면 대상이다(관리자 확인, 2026-11-02):
//   1. 유급 60시간 이상   2. 월 급여(세전) 220만 원 이상   3. 근무일 8일 이상
// 단, 그 달 1일 이전부터 계속 근무 중이어야 한다 — 그 달에 처음 온 직원은 1~3을 충족해도 그 달은 대상이 아니고,
// 다음 달까지 이어서 일하면 그때부터 대상이다. "계속 근무"는 바로 전 달에 근무가 있었는지로 본다
// (한 달 이상 쉬었다 다시 오면 처음 온 것으로 다시 센다 — 팝업마다 단기로 오는 직원이 많아 보수적으로).
//
// 신고(사업장가입자 자격취득신고)는 해당 달의 다음 달 15일까지.

export const PENSION_MIN_HOURS = 60
export const PENSION_MIN_PAY = 2_200_000
export const PENSION_MIN_DAYS = 8

export type PensionStatus = 'eligible' | 'first-month' | 'none'

export interface PensionInput {
  /** 그 달 근무한 날짜 수(같은 날 배정이 둘이어도 하루) */
  days: number
  /** 그 달 유급 시간 */
  hours: number
  /** 그 달 세전 급여 — 기본급 + 수당(공제는 빼지 않는다) */
  pay: number
  /** 바로 전 달에 근무가 있었는지 */
  workedPrevMonth: boolean
}

export interface PensionResult {
  status: PensionStatus
  /** 충족한 조건 — 화면에 근거로 보여준다 */
  reasons: string[]
}

export function evaluatePension({ days, hours, pay, workedPrevMonth }: PensionInput): PensionResult {
  const reasons: string[] = []
  if (hours >= PENSION_MIN_HOURS) reasons.push(`${PENSION_MIN_HOURS}시간 이상`)
  if (pay >= PENSION_MIN_PAY) reasons.push(`월 ${PENSION_MIN_PAY / 10_000}만 원 이상`)
  if (days >= PENSION_MIN_DAYS) reasons.push(`${PENSION_MIN_DAYS}일 이상`)
  if (reasons.length === 0) return { status: 'none', reasons }
  return { status: workedPrevMonth ? 'eligible' : 'first-month', reasons }
}

/** 신고기한 — 해당 달(0-indexed month)의 다음 달 15일, YYYY-MM-DD */
export function pensionReportDeadline(year: number, month: number): string {
  const y = month === 11 ? year + 1 : year
  const m = month === 11 ? 1 : month + 2
  return `${y}-${String(m).padStart(2, '0')}-15`
}
