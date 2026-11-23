import { describe, it, expect } from 'vitest'
import { afterFee, monthSettlement, feePercentOf } from './popupSettlement'

describe('팝업 정산 예상', () => {
  it('매출 − 수수료', () => {
    expect(afterFee(25_405_000, 32)).toBe(17_275_400)
    expect(afterFee(1000, 0)).toBe(1000)
  })
  it('fee_percent는 문자열(numeric)로 와도 숫자', () => {
    expect(feePercentOf({ fee_percent: '32.50' })).toBe(32.5)
    expect(feePercentOf({ fee_percent: null })).toBeNull()
  })
  it('팝업마다 다른 수수료 + 나머지는 기본 수수료', () => {
    const r = monthSettlement(1_100, [{ revenue: 600, feePercent: 30 }, { revenue: 400, feePercent: 25 }], 20)
    // 180 + 100 + (100 × 20%) = 300
    expect(r).toEqual({ afterFee: 800, fee: 300, usesFallback: true })
  })
  it('모두 설정돼 있고 나머지가 없으면 기본 수수료 안 씀', () => {
    expect(monthSettlement(1_000, [{ revenue: 1_000, feePercent: 30 }], 20)).toEqual({ afterFee: 700, fee: 300, usesFallback: false })
  })
})
