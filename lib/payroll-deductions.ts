// 급여 세부의 "바로 공제" — 기본급에 비율을 곱해 공제 조정 항목(음수 금액)을 만든다.
// 공제는 저장 시점의 기본급으로 금액이 고정된다. 근무가 바뀌면 화면이 어긋남을 표시하고 다시 계산한다.

/** 3.3% 원천징수 — 사업소득세 3% + 지방소득세(소득세의 10%). 각각 10원 미만 절사(국고금관리법 소액 절사) */
export function withholding33(base: number): { incomeTax: number; localTax: number; total: number } {
  const b = Math.max(0, base)
  const incomeTax = Math.floor((b * 3) / 100 / 10) * 10
  const localTax = Math.floor(incomeTax / 10 / 10) * 10
  return { incomeTax, localTax, total: incomeTax + localTax }
}

/** 비율(%) 공제 — 원 미만 절사. 고용보험 근로자 부담분(0.9%)도 이 규칙이다 */
export function percentDeduction(base: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0
  // 0.9 같은 소수 비율의 부동소수 오차(343750 × 0.009 = 3093.7499…)를 피하려고 만분율 정수로 계산
  const basisPoints = Math.round(percent * 100)
  return Math.floor((Math.max(0, base) * basisPoints) / 10000)
}

/**
 * 국민연금 근로자 부담분 — 2026년 보험료율 9.5%(연금개혁, 매년 0.5%p씩 13%까지)의 절반.
 * 기준소득월액 = 세전 월 급여의 천 원 미만 절사, 하한·상한 안으로 맞춘다(2025.7~2026.6 고시값 — 매년 7월 바뀐다).
 * 보험료는 10원 미만 절사. 가입 대상 판정은 lib/nationalPension.ts.
 */
export const PENSION_EMPLOYEE_PERCENT = 4.75
export const PENSION_BASE_MIN = 400_000
export const PENSION_BASE_MAX = 6_370_000

export function nationalPensionEmployee(pay: number): number {
  if (pay <= 0) return 0
  const base = Math.min(PENSION_BASE_MAX, Math.max(PENSION_BASE_MIN, Math.floor(pay / 1000) * 1000))
  return Math.floor((base * Math.round(PENSION_EMPLOYEE_PERCENT * 100)) / 10000 / 10) * 10
}

/**
 * 건강보험 근로자 부담분 — 2026년 보험료율 7.19%의 절반 3.595%. 보수월액(세전 월 급여) 기준, 10원 미만 절사.
 * 장기요양보험은 건강보험료에 붙어 같이 고지된다 — 근로자 건강보험료의 13.14%, 10원 미만 절사.
 */
export const HEALTH_EMPLOYEE_PERCENT = 3.595
export const LONG_TERM_CARE_PERCENT_OF_HEALTH = 13.14

export function healthInsuranceEmployee(pay: number): number {
  if (pay <= 0) return 0
  return Math.floor((pay * Math.round(HEALTH_EMPLOYEE_PERCENT * 1000)) / 100000 / 10) * 10
}

export function longTermCareEmployee(pay: number): number {
  return Math.floor((healthInsuranceEmployee(pay) * Math.round(LONG_TERM_CARE_PERCENT_OF_HEALTH * 100)) / 10000 / 10) * 10
}

export const WITHHOLDING_LABEL = '원천징수 3.3%'
export const PENSION_LABEL = `국민연금 ${PENSION_EMPLOYEE_PERCENT}%`
export const HEALTH_LABEL = `건강보험 ${HEALTH_EMPLOYEE_PERCENT}%`
export const LONG_TERM_CARE_LABEL = '장기요양보험'
/** 국민연금·건강보험 가입 대상(lib/nationalPension 판정)이면 넣는 공제 — 장기요양은 건강보험에 딸려 같이 뗀다 */
export const SOCIAL_INSURANCE_LABELS = [PENSION_LABEL, HEALTH_LABEL, LONG_TERM_CARE_LABEL] as const
export const EMPLOYMENT_INSURANCE_LABEL = '고용보험 0.9%'
export const EMPLOYMENT_INSURANCE_PERCENT = 0.9

/** 직원별 기본 공제(staff_profiles.default_deduction) → 바로 공제 라벨 */
export const DEFAULT_DEDUCTIONS = {
  withholding33: WITHHOLDING_LABEL,
  employment_insurance: EMPLOYMENT_INSURANCE_LABEL,
} as const
export type DefaultDeduction = keyof typeof DEFAULT_DEDUCTIONS

export const isDefaultDeduction = (v: unknown): v is DefaultDeduction =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_DEDUCTIONS, v)

/**
 * 바로 공제의 종류 — 저장된 조정 항목은 라벨 문자열뿐이라 라벨로 종류를 알아낸다.
 * 라벨에 요율이 들어 있어(예: '국민연금 4.75%') 요율이 바뀌면 라벨도 바뀌므로, 정확히 같은 문자열이 아니라
 * 종류로 맞춘다 — 그래야 요율을 고친 뒤에도 지난달에 넣은 '국민연금 4.75%'를 같은 공제로 본다.
 */
export type DeductionKind = 'withholding33' | 'employment' | 'pension' | 'health' | 'longTermCare'

const KIND_PATTERNS: [DeductionKind, RegExp][] = [
  ['withholding33', /^원천징수 3\.3%$/],
  ['employment', /^고용보험( [\d.]+%)?$/],
  ['pension', /^국민연금( [\d.]+%)?$/],
  ['health', /^건강보험( [\d.]+%)?$/],
  ['longTermCare', /^장기요양(보험)?( [\d.]+%)?$/],
]

export function deductionKind(label: string): DeductionKind | null {
  const t = label.trim()
  return KIND_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null
}

/** 두 라벨이 같은 바로 공제인지 — 종류가 없는 항목(수당·직접 입력)은 문자열이 같을 때만 */
export function isSameDeduction(a: string, b: string): boolean {
  const ka = deductionKind(a)
  return ka != null ? ka === deductionKind(b) : a === b
}

/** 빠른 공제 항목의 조정 금액(음수) — 종류로 계산하므로 요율이 바뀐 뒤의 옛 라벨도 지금 요율로 다시 계산된다 */
export function quickDeductionAmount(label: string, base: number): number | null {
  switch (deductionKind(label)) {
    case 'withholding33': return -withholding33(base).total
    case 'employment': return -percentDeduction(base, EMPLOYMENT_INSURANCE_PERCENT)
    case 'pension': return -nationalPensionEmployee(base)
    case 'health': return -healthInsuranceEmployee(base)
    case 'longTermCare': return -longTermCareEmployee(base)
    default: return null
  }
}

/**
 * 한 사람의 국민연금·건강보험·장기요양을 그 사람의 월 보수 합계로 한 번 계산해, 프로필(주방·캐셔)별 보수 비율로 나눈다.
 * 프로필마다 따로 계산하면 적은 쪽에도 국민연금 하한(40만 원)이 걸려 실제 보험료보다 더 뗀다.
 * 나눈 끝전은 보수가 가장 큰 프로필이 가진다 — 합계가 사람 단위 보험료와 정확히 같다.
 */
export function splitSocialInsurance(profilePays: { staffId: number; pay: number }[]): Record<number, { label: string; amount: number }[]> {
  const total = profilePays.reduce((s, p) => s + Math.max(0, p.pay), 0)
  const out: Record<number, { label: string; amount: number }[]> = {}
  for (const p of profilePays) out[p.staffId] = []
  if (total <= 0 || profilePays.length === 0) return out
  const largest = profilePays.reduce((a, b) => (b.pay > a.pay ? b : a))
  for (const label of SOCIAL_INSURANCE_LABELS) {
    const whole = -(quickDeductionAmount(label, total) ?? 0)
    let given = 0
    for (const p of profilePays) {
      if (p === largest) continue
      const share = Math.floor((whole * Math.max(0, p.pay)) / total / 10) * 10
      given += share
      if (share > 0) out[p.staffId].push({ label, amount: -share })
    }
    if (whole - given > 0) out[largest.staffId].push({ label, amount: -(whole - given) })
  }
  return out
}

export interface PayEstimateLine {
  label: string
  amount: number
  /** 관리자가 아직 넣지 않은 기본 공제를 미리 계산해 보여주는 줄 — 확정 전이라는 표시용 */
  estimated: boolean
}

/**
 * 근무자 화면의 예상 급여 — 급여정산 상세(PayrollDetailModal)와 같은 식이다: 기본급 + 저장된 조정 항목.
 * deductions에 든 바로 공제(직원 기본 공제, 화면에서 켠 3.3%, 국민연금·건강보험 대상이면 그 보험료)가 이 구간에 아직
 * 저장돼 있지 않으면(관리자 정산 전) 미리 계산해 넣는다. 같은 종류의 항목이 이미 있으면 그 저장값을 쓴다 — 두 번 빼지 않는다.
 * 금액을 함께 준 항목(사람 단위로 나눈 4대보험, splitSocialInsurance)은 그 금액을 그대로 쓴다.
 */
export function estimatePay(
  basePay: number,
  adjustments: { label: string; amount: number }[],
  deductions: (string | { label: string; amount: number })[],
): { lines: PayEstimateLine[]; finalPay: number } {
  const lines: PayEstimateLine[] = adjustments.map(a => ({ label: a.label, amount: a.amount, estimated: false }))
  const seen = new Set<string>()
  for (const d of deductions) {
    const label = typeof d === 'string' ? d : d.label
    const key = deductionKind(label) ?? label
    if (seen.has(key)) continue
    seen.add(key)
    const amount = typeof d === 'string' ? quickDeductionAmount(label, basePay) : d.amount
    if (amount != null && amount !== 0 && !adjustments.some(a => isSameDeduction(a.label, label))) {
      lines.push({ label, amount, estimated: true })
    }
  }
  return { lines, finalPay: basePay + lines.reduce((s, l) => s + l.amount, 0) }
}
