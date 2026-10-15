import { describe, it, expect } from 'vitest'
import { withholding33, percentDeduction, quickDeductionAmount, WITHHOLDING_LABEL, EMPLOYMENT_INSURANCE_LABEL } from './payroll-deductions'

describe('withholding33', () => {
  it('소득세 3%·지방세 10%를 각각 10원 미만 절사', () => {
    // 343,750 × 3% = 10,312.5 → 10,310 / 지방세 1,031 → 1,030
    expect(withholding33(343_750)).toEqual({ incomeTax: 10_310, localTax: 1_030, total: 11_340 })
  })
  it('기본급 0·음수는 0', () => {
    expect(withholding33(0).total).toBe(0)
    expect(withholding33(-1000).total).toBe(0)
  })
})

describe('percentDeduction', () => {
  it('원 미만 절사, 부동소수 오차 없이', () => {
    expect(percentDeduction(343_750, 0.9)).toBe(3_093)
    expect(percentDeduction(1_000_000, 0.9)).toBe(9_000)
    expect(percentDeduction(100_000, 2.5)).toBe(2_500)
  })
  it('0·음수·NaN 비율은 0', () => {
    expect(percentDeduction(100_000, 0)).toBe(0)
    expect(percentDeduction(100_000, -1)).toBe(0)
    expect(percentDeduction(100_000, NaN)).toBe(0)
  })
})

describe('quickDeductionAmount', () => {
  it('빠른 공제 라벨은 음수 금액, 그 외 라벨은 null', () => {
    expect(quickDeductionAmount(WITHHOLDING_LABEL, 343_750)).toBe(-11_340)
    expect(quickDeductionAmount(EMPLOYMENT_INSURANCE_LABEL, 343_750)).toBe(-3_093)
    expect(quickDeductionAmount('식대', 343_750)).toBeNull()
  })
})
