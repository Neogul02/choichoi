import { describe, it, expect } from 'vitest'
import {
  withholding33, percentDeduction, quickDeductionAmount, WITHHOLDING_LABEL, EMPLOYMENT_INSURANCE_LABEL,
  DEFAULT_DEDUCTIONS, isDefaultDeduction, estimatePay,
} from './payroll-deductions'

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

describe('기본 공제(staff_profiles.default_deduction)', () => {
  it('DB 값을 바로 공제 라벨로 바꾸고, 그 라벨로 금액을 계산할 수 있다', () => {
    expect(quickDeductionAmount(DEFAULT_DEDUCTIONS.withholding33, 1_000_000)).toBe(-33_000)
    expect(quickDeductionAmount(DEFAULT_DEDUCTIONS.employment_insurance, 1_000_000)).toBe(-9_000)
  })
  it('알 수 없는 값은 기본 공제로 보지 않는다', () => {
    expect(isDefaultDeduction('withholding33')).toBe(true)
    expect(isDefaultDeduction('toString')).toBe(false)
    expect(isDefaultDeduction('')).toBe(false)
    expect(isDefaultDeduction(null)).toBe(false)
  })
})

describe('estimatePay', () => {
  it('조정 항목이 없으면 기본급 그대로', () => {
    expect(estimatePay(343_750, [], [])).toEqual({ lines: [], finalPay: 343_750 })
  })

  it('저장된 조정 항목을 기본급에 더한다', () => {
    const r = estimatePay(500_000, [{ label: '교통비', amount: 20_000 }, { label: '지각', amount: -5_000 }], [])
    expect(r.finalPay).toBe(515_000)
    expect(r.lines.every(l => !l.estimated)).toBe(true)
  })

  it('기본 공제가 아직 없으면 미리 계산해 예상으로 표시', () => {
    const r = estimatePay(343_750, [], ['withholding33'])
    expect(r.lines).toEqual([{ label: WITHHOLDING_LABEL, amount: -11_340, estimated: true }])
    expect(r.finalPay).toBe(332_410)
  })

  it('같은 공제가 이미 저장돼 있으면 두 번 빼지 않는다', () => {
    const r = estimatePay(343_750, [{ label: WITHHOLDING_LABEL, amount: -11_340 }], ['withholding33'])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].estimated).toBe(false)
    expect(r.finalPay).toBe(332_410)
  })

  it('기본급 0이면 공제 줄을 만들지 않는다', () => {
    expect(estimatePay(0, [], ['employment_insurance'])).toEqual({ lines: [], finalPay: 0 })
  })

  it('공제 여러 개를 함께 미리 계산하고, 같은 공제가 중복으로 와도 한 번만 뺀다', () => {
    const r = estimatePay(343_750, [], ['employment_insurance', 'withholding33', 'withholding33'])
    expect(r.lines.map(l => l.label)).toEqual([EMPLOYMENT_INSURANCE_LABEL, WITHHOLDING_LABEL])
    expect(r.finalPay).toBe(343_750 - 3_093 - 11_340)
  })
})
