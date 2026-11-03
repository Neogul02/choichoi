import { describe, it, expect } from 'vitest'
import {
  withholding33, percentDeduction, quickDeductionAmount, WITHHOLDING_LABEL, EMPLOYMENT_INSURANCE_LABEL,
  DEFAULT_DEDUCTIONS, isDefaultDeduction, estimatePay, nationalPensionEmployee, PENSION_LABEL,
  healthInsuranceEmployee, longTermCareEmployee, HEALTH_LABEL, LONG_TERM_CARE_LABEL,
  deductionKind, isSameDeduction, splitSocialInsurance,
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
    const r = estimatePay(343_750, [], [WITHHOLDING_LABEL])
    expect(r.lines).toEqual([{ label: WITHHOLDING_LABEL, amount: -11_340, estimated: true }])
    expect(r.finalPay).toBe(332_410)
  })

  it('같은 공제가 이미 저장돼 있으면 두 번 빼지 않는다', () => {
    const r = estimatePay(343_750, [{ label: WITHHOLDING_LABEL, amount: -11_340 }], [WITHHOLDING_LABEL])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].estimated).toBe(false)
    expect(r.finalPay).toBe(332_410)
  })

  it('기본급 0이면 공제 줄을 만들지 않는다', () => {
    expect(estimatePay(0, [], [EMPLOYMENT_INSURANCE_LABEL])).toEqual({ lines: [], finalPay: 0 })
  })

  it('공제 여러 개를 함께 미리 계산하고, 같은 공제가 중복으로 와도 한 번만 뺀다', () => {
    const r = estimatePay(343_750, [], [EMPLOYMENT_INSURANCE_LABEL, WITHHOLDING_LABEL, WITHHOLDING_LABEL])
    expect(r.lines.map(l => l.label)).toEqual([EMPLOYMENT_INSURANCE_LABEL, WITHHOLDING_LABEL])
    expect(r.finalPay).toBe(343_750 - 3_093 - 11_340)
  })
})

describe('nationalPensionEmployee', () => {
  it('기준소득월액(천 원 미만 절사) × 4.75%, 10원 미만 절사', () => {
    // 2,421,900 → 기준 2,421,000 × 4.75% = 114,997.5 → 114,990
    expect(nationalPensionEmployee(2_421_900)).toBe(114_990)
  })
  it('하한·상한 — 적게 받아도 하한 기준, 많이 받아도 상한 기준', () => {
    expect(nationalPensionEmployee(300_000)).toBe(19_000) // 400,000 × 4.75%
    expect(nationalPensionEmployee(9_000_000)).toBe(302_570) // 6,370,000 × 4.75% = 302,575 → 302,570
  })
  it('급여가 없으면 0', () => {
    expect(nationalPensionEmployee(0)).toBe(0)
  })
  it('바로 공제 라벨로도 계산된다(음수)', () => {
    expect(quickDeductionAmount(PENSION_LABEL, 1_086_800)).toBe(-51_580) // 1,086,000 × 4.75% = 51,585 → 51,580
  })
})

describe('건강보험·장기요양 (근로자 몫)', () => {
  it('세전 200만 원 → 건강보험 71,900원, 장기요양 9,440원', () => {
    expect(healthInsuranceEmployee(2_000_000)).toBe(71_900)
    expect(longTermCareEmployee(2_000_000)).toBe(9_440) // 71,900 × 13.14% = 9,447.66 → 9,440
  })
  it('세전 250만 원 → 건강보험 89,870원(89,875 절사), 장기요양 11,800원', () => {
    expect(healthInsuranceEmployee(2_500_000)).toBe(89_870)
    expect(longTermCareEmployee(2_500_000)).toBe(11_800)
  })
  it('바로 공제 라벨로도 음수로 계산된다', () => {
    expect(quickDeductionAmount(HEALTH_LABEL, 2_000_000)).toBe(-71_900)
    expect(quickDeductionAmount(LONG_TERM_CARE_LABEL, 2_000_000)).toBe(-9_440)
  })
  it('급여가 없으면 0', () => {
    expect(healthInsuranceEmployee(0)).toBe(0)
    expect(longTermCareEmployee(0)).toBe(0)
  })
})

describe('deductionKind / isSameDeduction', () => {
  it('요율이 바뀐 라벨도 같은 종류로 본다', () => {
    expect(deductionKind('국민연금 4.75%')).toBe('pension')
    expect(deductionKind('국민연금 5%')).toBe('pension')
    expect(isSameDeduction('국민연금 4.75%', '국민연금 5%')).toBe(true)
    expect(isSameDeduction('건강보험 3.545%', HEALTH_LABEL)).toBe(true)
    expect(isSameDeduction(LONG_TERM_CARE_LABEL, '장기요양')).toBe(true)
  })
  it('종류가 다르거나 직접 입력한 항목은 문자열이 같을 때만 같다', () => {
    expect(isSameDeduction(PENSION_LABEL, HEALTH_LABEL)).toBe(false)
    expect(isSameDeduction('교통비', '교통비')).toBe(true)
    expect(isSameDeduction('교통비', '식대')).toBe(false)
    expect(deductionKind('국민연금 환급')).toBeNull()
  })
  it('옛 요율 라벨도 지금 요율로 계산된다', () => {
    expect(quickDeductionAmount('국민연금 4.5%', 2_000_000)).toBe(-95_000)
  })
})

describe('splitSocialInsurance', () => {
  const sum = (r: Record<number, { label: string; amount: number }[]>, label: string) =>
    Object.values(r).flat().filter(d => d.label === label).reduce((s, d) => s + d.amount, 0)

  it('프로필이 하나면 사람 단위 보험료 그대로', () => {
    const r = splitSocialInsurance([{ staffId: 1, pay: 2_000_000 }])
    expect(r[1]).toEqual([
      { label: PENSION_LABEL, amount: -95_000 },
      { label: HEALTH_LABEL, amount: -71_900 },
      { label: LONG_TERM_CARE_LABEL, amount: -9_440 },
    ])
  })

  it('주방·캐셔로 나뉘어도 합계는 합친 보수로 한 번 계산한 값 — 적은 쪽에 하한이 따로 걸리지 않는다', () => {
    // 주방 100만 + 캐셔 15만 = 115만 → 국민연금 54,620(1,150,000 × 4.75% = 54,625 → 54,620)
    const r = splitSocialInsurance([{ staffId: 1, pay: 1_000_000 }, { staffId: 2, pay: 150_000 }])
    expect(sum(r, PENSION_LABEL)).toBe(-54_620)
    expect(sum(r, HEALTH_LABEL)).toBe(-(Math.floor(1_150_000 * 3595 / 100000 / 10) * 10))
    // 캐셔 몫은 보수 비율만큼 — 프로필별로 따로 계산했다면 하한 40만 원 기준 19,000원이 됐을 것
    expect(-r[2].find(d => d.label === PENSION_LABEL)!.amount).toBeLessThan(19_000)
  })

  it('보수가 없으면 아무것도 넣지 않는다', () => {
    expect(splitSocialInsurance([{ staffId: 1, pay: 0 }])).toEqual({ 1: [] })
  })
})
