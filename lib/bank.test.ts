import { describe, it, expect } from 'vitest'
import {
  normalizeBankAccount, isValidBankAccount, formatBankAccountInput, bankAccountMatches,
  BANK_ACCOUNT_MAX_DIGITS,
} from './bank'

describe('normalizeBankAccount', () => {
  it('하이픈·공백을 제거하고 숫자만 남긴다', () => {
    expect(normalizeBankAccount('3333-19-7705887')).toBe('3333197705887')
    expect(normalizeBankAccount('205502 04 512133')).toBe('20550204512133')
    expect(normalizeBankAccount('110-513-758093')).toBe('110513758093')
  })

  it('계좌번호 칸에 섞여 들어온 은행명도 걸러낸다', () => {
    expect(normalizeBankAccount('3333352937805 카카오뱅크')).toBe('3333352937805')
  })

  it('null·빈 값은 빈 문자열', () => {
    expect(normalizeBankAccount(null)).toBe('')
    expect(normalizeBankAccount(undefined)).toBe('')
    expect(normalizeBankAccount('---')).toBe('')
  })
})

describe('isValidBankAccount', () => {
  it('실사용 자리수(10~16)를 통과시킨다', () => {
    expect(isValidBankAccount('110513758093')).toBe(true)      // 12
    expect(isValidBankAccount('3333-19-7705887')).toBe(true)   // 13
    expect(isValidBankAccount('205502 04 512133')).toBe(true)  // 14
  })

  it('너무 짧거나 긴 값은 거부한다', () => {
    expect(isValidBankAccount('12345678')).toBe(false)
    expect(isValidBankAccount('12345678901234567')).toBe(false)
    expect(isValidBankAccount('')).toBe(false)
    expect(isValidBankAccount(null)).toBe(false)
  })
})

describe('formatBankAccountInput', () => {
  it('숫자만 통과시키고 최대 자리수에서 자른다', () => {
    expect(formatBankAccountInput('3333-19-7705887')).toBe('3333197705887')
    expect(formatBankAccountInput('국민 1234')).toBe('1234')
    expect(formatBankAccountInput('1'.repeat(30))).toHaveLength(BANK_ACCOUNT_MAX_DIGITS)
  })
})

describe('bankAccountMatches', () => {
  it('하이픈을 넣어 검색해도 걸린다', () => {
    expect(bankAccountMatches('3333197705887', '3333-19')).toBe(true)
    expect(bankAccountMatches('3333197705887', '7705887')).toBe(true)
    expect(bankAccountMatches('3333197705887', '9999')).toBe(false)
    expect(bankAccountMatches(null, '3333')).toBe(false)
  })
})
