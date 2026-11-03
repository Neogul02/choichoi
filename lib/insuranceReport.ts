// 세무사에게 보내는 월별 4대보험 자료(근로내용 확인신고서 일용근로자용 + 가입 대상자 명단)의 계산 규칙.
// 엑셀 만들기는 화면(PayrollPanel), 데이터 모으기는 app/actions/payroll.ts fetchInsuranceReport가 한다.

/** 사업장 정보 — 근로내용 확인신고서(2026.9월분) 그대로 */
export const BUSINESS_INFO = {
  name: '초이초이 (Choi Choi)',
  managementNo: '44717023170',
  registrationNo: '447-17-02317',
  address: '경기도 동두천시 동두천로 119, 102호',
  mobile: '010-8366-2414',
} as const

/** 직종 부호 — 신고서에 써 온 값(캐셔 61, 주방 87) */
export const JOB_CODE: Record<'cashier' | 'kitchen', string> = { cashier: '61', kitchen: '87' }

const monthKey = (date: string) => date.slice(0, 7)
const prevMonthKey = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * 입사일(자격취득일) — 보고하는 달부터 거꾸로 근무가 끊김 없이 이어진 달들 중 가장 이른 근무일.
 * 한 달 이상 쉬었다 오면 다시 온 날이 입사일이다(국민연금 판정의 "전 달 근무" 규칙과 같은 기준).
 * dates는 그 사람의 모든 근무일(YYYY-MM-DD, 순서 무관), reportMonth는 'YYYY-MM'.
 */
export function continuousStartDate(dates: string[], reportMonth: string): string | null {
  const months = new Set(dates.map(monthKey))
  if (!months.has(reportMonth)) return null
  let first = reportMonth
  while (months.has(prevMonthKey(first))) first = prevMonthKey(first)
  return dates.filter(d => monthKey(d) === first).sort()[0]
}

/** 일평균 근로시간 — 유급 시간 ÷ 근로일수, 0.1h 단위 */
export function averageDailyHours(hours: number, days: number): number {
  return days > 0 ? Math.round((hours / days) * 10) / 10 : 0
}
