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

/** 근로내용 확인신고서에 기본으로 넣는 기준 — 월 보수 50만 원 이하는 신고하지 않아 왔다(관리자 확인, 2026-11-03) */
export const LABOR_REPORT_MIN_PAY = 500_000

/** 미리보기 창이 처음 체크해 두는 사람 — 월 보수가 50만 원을 넘는 사람 */
export function isDefaultReportTarget(pay: number): boolean {
  return pay > LABOR_REPORT_MIN_PAY
}

/** 주민등록번호를 'YYMMDD-NNNNNNN'으로 — 13자리가 아니면(외국인 번호 등) 받은 그대로 */
export function formatResidentId(rrn: string | null): string {
  if (!rrn) return ''
  const d = rrn.replace(/\D/g, '')
  return d.length === 13 ? `${d.slice(0, 6)}-${d.slice(6)}` : rrn
}

/** 주방 먼저, 그다음 캐셔 — 각 묶음 안은 받은 순서 그대로(이름순) */
export const REPORT_ROLE_ORDER = ['kitchen', 'cashier'] as const
export const REPORT_ROLE_LABEL: Record<(typeof REPORT_ROLE_ORDER)[number], string> = { kitchen: '주방', cashier: '캐셔' }

export function groupByRole<T extends { staffRole: 'kitchen' | 'cashier' }>(rows: T[]): { role: 'kitchen' | 'cashier'; rows: T[] }[] {
  return REPORT_ROLE_ORDER.map(role => ({ role, rows: rows.filter(r => r.staffRole === role) })).filter(g => g.rows.length > 0)
}
