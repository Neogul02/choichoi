import { describe, it, expect } from 'vitest'
import { formatPhoneInput, isValidKoreanPhone, normalizePhone, phoneMatches } from './phone'

describe('formatPhoneInput', () => {
  it('010 모바일 번호를 3-4-4로 포맷한다', () => {
    expect(formatPhoneInput('01012345678')).toBe('010-1234-5678')
    expect(formatPhoneInput('010-1234-5678')).toBe('010-1234-5678')
  })

  it('타이핑 중간 자리수도 자연스럽게 하이픈을 붙인다', () => {
    expect(formatPhoneInput('010')).toBe('010')
    expect(formatPhoneInput('0101')).toBe('010-1')
    expect(formatPhoneInput('01012')).toBe('010-12')
    expect(formatPhoneInput('0101234')).toBe('010-123-4')
    expect(formatPhoneInput('01012345')).toBe('010-123-45')
  })

  it('02 서울 지역번호는 2자리 지역코드로 분리한다', () => {
    expect(formatPhoneInput('021234567')).toBe('02-123-4567')
    expect(formatPhoneInput('0212345678')).toBe('02-1234-5678')
    expect(formatPhoneInput('02')).toBe('02')
    expect(formatPhoneInput('021')).toBe('02-1')
  })

  it('10자리 일반 번호(구형 011 등)를 3-3-4로 포맷한다', () => {
    expect(formatPhoneInput('0111234567')).toBe('011-123-4567')
  })

  it('숫자 외 문자는 무시하고 11자리를 초과하면 자른다', () => {
    expect(formatPhoneInput('010abc12345678xyz')).toBe('010-1234-5678')
  })

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(formatPhoneInput('')).toBe('')
  })
})

describe('isValidKoreanPhone', () => {
  it('11자리 모바일 번호는 유효하다', () => {
    expect(isValidKoreanPhone('010-1234-5678')).toBe(true)
    expect(isValidKoreanPhone('01012345678')).toBe(true)
  })

  it('10자리 번호도 유효하다', () => {
    expect(isValidKoreanPhone('011-123-4567')).toBe(true)
  })

  it('02 지역번호는 9~10자리여야 유효하다', () => {
    expect(isValidKoreanPhone('02-123-4567')).toBe(true)
    expect(isValidKoreanPhone('02-1234-5678')).toBe(true)
    expect(isValidKoreanPhone('02-12-3456')).toBe(false)
  })

  it('자리수가 부족하거나 초과하면 무효하다', () => {
    expect(isValidKoreanPhone('010-1234')).toBe(false)
    expect(isValidKoreanPhone('010-1234-56789')).toBe(false)
    expect(isValidKoreanPhone('')).toBe(false)
  })
})

describe('normalizePhone', () => {
  it('하이픈·공백을 제거하고 숫자만 남긴다', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678')
    expect(normalizePhone(' 010 1234 5678 ')).toBe('01012345678')
    expect(normalizePhone('01012345678')).toBe('01012345678')
  })

  it('+82 국제표기를 0으로 시작하는 국내표기로 바꾼다', () => {
    expect(normalizePhone('+821026002792')).toBe('01026002792')
    expect(normalizePhone('+82 10-2600-2792')).toBe('01026002792')
    expect(normalizePhone('+82212345678')).toBe('0212345678')
  })

  it('빈 값은 빈 문자열이다', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('---')).toBe('')
  })
})

describe('isValidKoreanPhone — 0으로 시작하지 않으면 무효', () => {
  it('국가번호가 붙은 형태도 정규화 후 통과시킨다', () => {
    expect(isValidKoreanPhone('+821026002792')).toBe(true)
  })

  it('0으로 시작하지 않는 번호는 거부한다', () => {
    expect(isValidKoreanPhone('11012345678')).toBe(false)
    expect(isValidKoreanPhone('1234567890')).toBe(false)
  })
})

describe('formatPhoneInput — 국가번호 붙여넣기', () => {
  it('+82 로 시작하면 국내표기로 바꿔서 포맷한다', () => {
    expect(formatPhoneInput('+821012345678')).toBe('010-1234-5678')
    expect(formatPhoneInput('+82 10-1234-5678')).toBe('010-1234-5678')
  })
})

describe('phoneMatches', () => {
  it('DB에는 숫자만 저장돼도 하이픈을 넣어 검색하면 걸린다', () => {
    expect(phoneMatches('01012345678', '010-1234')).toBe(true)
    expect(phoneMatches('01012345678', '1234-5678')).toBe(true)
    expect(phoneMatches('01012345678', '5678')).toBe(true)
  })

  it('숫자가 없는 검색어나 빈 전화번호는 매치하지 않는다', () => {
    expect(phoneMatches('01012345678', '홍길동')).toBe(false)
    expect(phoneMatches(null, '010')).toBe(false)
    expect(phoneMatches('01012345678', '')).toBe(false)
  })
})
