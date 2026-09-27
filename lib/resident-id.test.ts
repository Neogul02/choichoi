import { describe, it, expect, vi, afterEach } from 'vitest'
import { birthFromResidentId, birthFromMasked, formatResidentId, maskResidentId } from './resident-id'

afterEach(() => { vi.useRealTimers() })

/** 만 나이는 오늘 날짜에 의존하므로 기준일을 고정한다 */
function at(dateStr: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${dateStr}T12:00:00`))
}

describe('birthFromResidentId', () => {
  it('성별 숫자로 세기를 가른다', () => {
    at('2026-09-27')
    expect(birthFromResidentId('990101', '1')?.date).toBe('1999-01-01')
    expect(birthFromResidentId('990101', '2')?.date).toBe('1999-01-01')
    expect(birthFromResidentId('050101', '3')?.date).toBe('2005-01-01')
    expect(birthFromResidentId('050101', '4')?.date).toBe('2005-01-01')
    // 5~8은 외국인 — 5·6은 1900년대, 7·8은 2000년대
    expect(birthFromResidentId('990101', '5')?.date).toBe('1999-01-01')
    expect(birthFromResidentId('050101', '7')?.date).toBe('2005-01-01')
    // 9·0은 1800년대
    expect(birthFromResidentId('990101', '9')?.date).toBe('1899-01-01')
  })

  it('생일이 지났는지에 따라 만 나이가 갈린다', () => {
    at('2026-09-27')
    expect(birthFromResidentId('000926', '3')?.age).toBe(26) // 어제 생일
    expect(birthFromResidentId('000927', '3')?.age).toBe(26) // 오늘 생일
    expect(birthFromResidentId('000928', '3')?.age).toBe(25) // 내일 생일
  })

  it('형식이 어긋나거나 월·일이 범위를 벗어나면 null', () => {
    at('2026-09-27')
    expect(birthFromResidentId('99010', '1')).toBeNull()
    expect(birthFromResidentId('991301', '1')).toBeNull() // 13월
    expect(birthFromResidentId('990132', '1')).toBeNull() // 32일
    expect(birthFromResidentId('990101', '')).toBeNull()
  })
})

describe('birthFromMasked', () => {
  it('마스킹값만으로 생년월일이 나온다 — 복호화가 필요 없다', () => {
    at('2026-09-27')
    expect(birthFromMasked(maskResidentId('990101', '1234567'))?.date).toBe('1999-01-01')
    expect(birthFromMasked('050315-4******')?.date).toBe('2005-03-15')
  })

  it('미등록(null)이나 깨진 값은 null', () => {
    expect(birthFromMasked(null)).toBeNull()
    expect(birthFromMasked(undefined)).toBeNull()
    expect(birthFromMasked('알 수 없음')).toBeNull()
  })
})

describe('formatResidentId', () => {
  it('13자리에만 하이픈을 넣고 그 외는 그대로 둔다', () => {
    expect(formatResidentId('9901011234567')).toBe('990101-1234567')
    expect(formatResidentId('990101-1234567')).toBe('990101-1234567')
    expect(formatResidentId('123')).toBe('123')
  })
})
