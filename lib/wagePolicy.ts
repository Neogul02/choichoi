/**
 * 시급 정책 — 최저임금과 회사 기준 시급을 날짜로 관리한다.
 *
 * 2027-01-01부터 회사 기준 시급 13,000원(최저임금 10,700원 × 주휴 1.2 = 12,840원 이상)을 **근무일 기준**으로
 * 강제한다. 직원 프로필 시급이 12,500원이어도 2027년 근무분은 13,000원으로 계산하고, 2026년 12월 근무분은
 * 그대로 12,500원이다 — 그래서 1월 1일에 직원 시급을 일괄 수정할 필요가 없고, 12월 급여를 1월에 정산해도 틀리지 않는다.
 * 프로필 시급이 더 높으면(14,000원 등) 그대로 쓴다.
 */
import { minutesToHours } from './workhours'

/** 연도별 법정 최저임금(시간급) */
export const MINIMUM_WAGE_BY_YEAR: Record<number, number> = {
  2026: 10_320,
  2027: 10_700,
}

/** 주 15시간 이상 근무 시 주휴수당을 시급에 녹인 배율(1일분/5일 = 1.2) */
export const WEEKLY_HOLIDAY_FACTOR = 1.2

/**
 * 회사 기준 시급 — `from`부터 적용. enforced면 그 날짜 이후 근무는 이 금액 미만으로 계산하지 않는다.
 * 새 직원·계약서의 기본 시급도 이 표를 따른다.
 */
export const COMPANY_RATE_SCHEDULE: { from: string; rate: number; enforced: boolean }[] = [
  { from: '2026-01-01', rate: 12_500, enforced: false },
  { from: '2027-01-01', rate: 13_000, enforced: true },
]

function scheduleOn(date: string) {
  let hit: (typeof COMPANY_RATE_SCHEDULE)[number] | null = null
  for (const s of COMPANY_RATE_SCHEDULE) if (s.from <= date) hit = s
  return hit
}

/** 그 날짜 기준 회사 기본 시급(새 직원·계약서 기본값) */
export function companyStandardRate(date: string): number {
  return scheduleOn(date)?.rate ?? COMPANY_RATE_SCHEDULE[0].rate
}

/** 그 날짜 근무에 실제 적용할 시급 — 프로필 시급과 회사 하한 중 큰 값 */
export function appliedHourlyRate(staffRate: number, date: string): number {
  const s = scheduleOn(date)
  return s?.enforced ? Math.max(staffRate, s.rate) : staffRate
}

/** 그 날짜의 법정 최저임금(표에 없는 해는 가장 가까운 앞 해) */
export function minimumWageOn(date: string): number {
  const year = Number(date.slice(0, 4))
  const years = Object.keys(MINIMUM_WAGE_BY_YEAR).map(Number).sort((a, b) => a - b)
  const y = [...years].reverse().find(v => v <= year) ?? years[0]
  return MINIMUM_WAGE_BY_YEAR[y]
}

/** 주휴 포함 최저 시급(최저임금 × 1.2) — 시급에 주휴를 녹여 주는 우리 방식의 하한 */
export function minimumRateWithHoliday(date: string): number {
  return Math.round(minimumWageOn(date) * WEEKLY_HOLIDAY_FACTOR)
}

export interface PaySegment { rate: number; hours: number; pay: number }

/**
 * 근무일별 유급 분 → 기본급. 적용 시급이 같은 날끼리 묶어 시간(0.1h 반올림)×시급을 더한다.
 * 한 구간에 시급이 하나면 예전 식(총 시간 × 시급)과 똑같다.
 */
export function basePayByDate(
  days: { date: string; paidMinutes: number }[],
  staffRate: number | null,
): { pay: number | null; segments: PaySegment[] } {
  if (staffRate == null) return { pay: null, segments: [] }
  const byRate = new Map<number, number>()
  for (const d of days) {
    const r = appliedHourlyRate(staffRate, d.date)
    byRate.set(r, (byRate.get(r) ?? 0) + d.paidMinutes)
  }
  const segments = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, minutes]) => {
      const hours = minutesToHours(minutes)
      return { rate, hours, pay: Math.round(hours * rate) }
    })
  return { pay: segments.reduce((s, x) => s + x.pay, 0), segments }
}

/** `12,500원` 또는 `12,500원→13,000원`(구간 안에서 시급이 바뀐 경우) */
export function formatAppliedRates(segments: PaySegment[], fallback: number | null): string {
  if (segments.length === 0) return fallback != null ? `${fallback.toLocaleString('ko-KR')}원` : '-'
  return segments.map(s => `${s.rate.toLocaleString('ko-KR')}원`).join('→')
}
