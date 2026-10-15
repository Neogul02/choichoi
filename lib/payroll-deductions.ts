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

export const WITHHOLDING_LABEL = '원천징수 3.3%'
export const EMPLOYMENT_INSURANCE_LABEL = '고용보험 0.9%'
export const EMPLOYMENT_INSURANCE_PERCENT = 0.9

/** 빠른 공제 항목의 조정 금액(음수) — 라벨로 기존 항목과 맞춰 재계산 여부를 판단한다 */
export function quickDeductionAmount(label: string, base: number): number | null {
  if (label === WITHHOLDING_LABEL) return -withholding33(base).total
  if (label === EMPLOYMENT_INSURANCE_LABEL) return -percentDeduction(base, EMPLOYMENT_INSURANCE_PERCENT)
  return null
}
