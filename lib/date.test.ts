import { describe, it, expect } from 'vitest'
import { parseDate, toDateStr, ymdToDateStr, addDays, prevDate, dayOfWeek, dayGroup, monthEndDateStr, kstToday, getKSTDateBounds, formatPhone } from './date'

describe('addDays / prevDate', () => {
  it('월 경계를 넘는다', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
    expect(prevDate('2026-08-01')).toBe('2026-07-31')
  })

  it('연 경계를 넘는다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(prevDate('2027-01-01')).toBe('2026-12-31')
  })

  it('윤년 2월을 처리한다', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('parseDate/toDateStr 왕복이 항등이다', () => {
    for (const s of ['2026-01-01', '2026-08-02', '2024-02-29', '2026-12-31']) {
      expect(toDateStr(parseDate(s))).toBe(s)
    }
  })
})

describe('ymdToDateStr / monthEndDateStr', () => {
  it('0-기준 월을 YYYY-MM-DD로 만든다', () => {
    expect(ymdToDateStr(2026, 0, 5)).toBe('2026-01-05')
    expect(ymdToDateStr(2026, 11, 31)).toBe('2026-12-31')
  })

  it('달의 말일을 구한다 (윤년 포함)', () => {
    expect(monthEndDateStr(2026, 1)).toBe('2026-02-28')
    expect(monthEndDateStr(2024, 1)).toBe('2024-02-29')
    expect(monthEndDateStr(2026, 7)).toBe('2026-08-31')
    expect(monthEndDateStr(2026, 3)).toBe('2026-04-30')
  })
})

describe('dayOfWeek / dayGroup', () => {
  it('요일을 구한다 (2026-08-02는 일요일)', () => {
    expect(dayOfWeek('2026-08-02')).toBe(0)
    expect(dayOfWeek('2026-08-03')).toBe(1)
    expect(dayOfWeek('2026-08-08')).toBe(6)
  })

  it('목금토=A, 일월화수=B', () => {
    expect(dayGroup('2026-08-06')).toBe('A') // 목
    expect(dayGroup('2026-08-08')).toBe('A') // 토
    expect(dayGroup('2026-08-02')).toBe('B') // 일
    expect(dayGroup('2026-08-05')).toBe('B') // 수
  })
})

describe('kstToday', () => {
  it('YYYY-MM-DD 형식을 반환한다', () => {
    expect(kstToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getKSTDateBounds', () => {
  it('KST 자정~23:59:59.999를 UTC ISO로 변환한다 (9시간 당겨짐)', () => {
    const { start, end } = getKSTDateBounds('2026-08-02')
    expect(start).toBe('2026-08-01T15:00:00.000Z')
    expect(end).toBe('2026-08-02T14:59:59.999Z')
  })

  it('날짜 미지정 시 kstToday() 기준으로 계산한다', () => {
    const today = kstToday()
    const { start } = getKSTDateBounds()
    const { start: explicit } = getKSTDateBounds(today)
    expect(start).toBe(explicit)
  })

  it('자정 경계 근처 날짜에서도 하루 범위를 정확히 계산한다', () => {
    const { start, end } = getKSTDateBounds('2026-01-01')
    expect(start).toBe('2025-12-31T15:00:00.000Z')
    expect(end).toBe('2026-01-01T14:59:59.999Z')
  })
})

describe('formatPhone', () => {
  it('11자리·10자리 번호를 하이픈 포맷한다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678')
    expect(formatPhone('0212345678')).toBe('021-234-5678')
  })

  it('이미 포맷된 입력도 숫자만 추출해 재포맷한다', () => {
    expect(formatPhone('010-1234-5678')).toBe('010-1234-5678')
  })

  it('그 외 길이는 원본 그대로 반환한다', () => {
    expect(formatPhone('123')).toBe('123')
    expect(formatPhone('')).toBe('')
  })
})
