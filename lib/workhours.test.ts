import { describe, it, expect } from 'vitest'
import { hhmmToMinutes, shiftRawMinutes, paidMinutes, minutesToHours, DEFAULT_BREAK_MINUTES } from './workhours'

describe('hhmmToMinutes', () => {
  it('HH:MM을 분으로 변환한다', () => {
    expect(hhmmToMinutes('00:00')).toBe(0)
    expect(hhmmToMinutes('09:00')).toBe(540)
    expect(hhmmToMinutes('09:30')).toBe(570)
    expect(hhmmToMinutes('23:59')).toBe(1439)
  })

  it('DB time 컬럼의 초 단위(HH:MM:SS)는 무시한다', () => {
    expect(hhmmToMinutes('09:30:45')).toBe(570)
    expect(hhmmToMinutes('06:00:00')).toBe(360)
  })
})

describe('shiftRawMinutes', () => {
  it('주간 근무 시간을 계산한다', () => {
    expect(shiftRawMinutes('09:00', '18:00')).toBe(540)
    expect(shiftRawMinutes('06:00', '15:00')).toBe(540)
  })

  it('자정을 넘기는 야간 근무는 +24h 보정한다', () => {
    expect(shiftRawMinutes('22:00', '06:00')).toBe(480)
    expect(shiftRawMinutes('15:00', '00:00')).toBe(540)
    expect(shiftRawMinutes('23:30', '00:30')).toBe(60)
  })

  it('출퇴근이 같으면 0 (24시간 근무가 아니라 0으로 본다)', () => {
    expect(shiftRawMinutes('09:00', '09:00')).toBe(0)
  })
})

describe('paidMinutes', () => {
  it('오버라이드가 없으면 기본 휴게시간을 차감한다', () => {
    expect(DEFAULT_BREAK_MINUTES).toBe(60)
    expect(paidMinutes('09:00', '18:00', null)).toBe(480)
    expect(paidMinutes('09:00', '18:00', undefined)).toBe(480)
  })

  it('휴게시간 오버라이드를 적용한다 (0 포함)', () => {
    expect(paidMinutes('09:00', '18:00', 0)).toBe(540)
    expect(paidMinutes('09:00', '18:00', 30)).toBe(510)
    expect(paidMinutes('09:00', '18:00', 90)).toBe(450)
  })

  it('휴게시간이 근무시간보다 길면 음수가 아니라 0', () => {
    expect(paidMinutes('09:00', '09:30', null)).toBe(0)
    expect(paidMinutes('09:00', '10:00', 120)).toBe(0)
  })

  it('야간 근무에도 휴게 차감이 적용된다', () => {
    expect(paidMinutes('22:00', '06:00', null)).toBe(420)
    expect(paidMinutes('22:00', '06:00', 90)).toBe(390)
  })
})

describe('minutesToHours', () => {
  it('0.1h 단위로 반올림한다', () => {
    expect(minutesToHours(480)).toBe(8)
    expect(minutesToHours(489)).toBe(8.2) // 8.15h → 8.2
    expect(minutesToHours(33)).toBe(0.6) // 0.55h → 0.6
    expect(minutesToHours(615)).toBe(10.3) // 10.25h → 10.3
    expect(minutesToHours(0)).toBe(0)
  })

  it('.X5 경계는 반올림(올림)한다 — 부동소수점 오차로 내림되지 않는다', () => {
    expect(minutesToHours(483)).toBe(8.1) // 정확히 8.05h
    expect(minutesToHours(87)).toBe(1.5) // 정확히 1.45h
    expect(minutesToHours(45)).toBe(0.8) // 정확히 0.75h
  })

  it('합산 후 1회 반올림과 개별 반올림 후 합산은 다르다 — 반드시 합산 후 호출', () => {
    // 각 265분(4.416...h) 근무 3회: 개별 반올림 4.4*3=13.2, 합산 후 반올림 795분=13.3
    expect(minutesToHours(265) * 3).toBeCloseTo(13.2)
    expect(minutesToHours(265 * 3)).toBe(13.3)
  })
})
