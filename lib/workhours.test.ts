import { describe, it, expect } from 'vitest'
import {
  hhmmToMinutes, minutesToHHMM, shiftRawMinutes, paidMinutes, minutesToHours,
  crossesMidnight, isFullDay, formatTimeRange, resolveBreakMinutes,
  DEFAULT_BREAK_MINUTES, MINUTES_IN_DAY,
} from './workhours'

describe('hhmmToMinutes', () => {
  it('HH:MM을 분으로 변환한다', () => {
    expect(hhmmToMinutes('00:00')).toBe(0)
    expect(hhmmToMinutes('09:00')).toBe(540)
    expect(hhmmToMinutes('09:30')).toBe(570)
    expect(hhmmToMinutes('23:59')).toBe(1439)
  })

  it('하루의 끝은 24:00 = 1440분', () => {
    expect(hhmmToMinutes('24:00')).toBe(MINUTES_IN_DAY)
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

  it('출퇴근이 같으면 24시간 근무로 본다 (길이 0인 근무는 의미가 없다)', () => {
    expect(shiftRawMinutes('09:00', '09:00')).toBe(MINUTES_IN_DAY)
    expect(shiftRawMinutes('00:00', '00:00')).toBe(MINUTES_IN_DAY)
  })

  it('00:00~24:00 종일 근무는 1440분', () => {
    expect(shiftRawMinutes('00:00', '24:00')).toBe(MINUTES_IN_DAY)
  })

  it('24:00으로 끝나는 근무는 자정까지로 계산한다', () => {
    expect(shiftRawMinutes('18:00', '24:00')).toBe(360)
  })
})

describe('minutesToHHMM', () => {
  it('분을 HH:MM으로 되돌린다', () => {
    expect(minutesToHHMM(0)).toBe('00:00')
    expect(minutesToHHMM(570)).toBe('09:30')
    expect(minutesToHHMM(MINUTES_IN_DAY)).toBe('24:00')
  })

  it('익일로 넘어간 분은 24를 빼고 표기한다', () => {
    expect(minutesToHHMM(MINUTES_IN_DAY + 360)).toBe('06:00')
  })
})

describe('crossesMidnight / isFullDay', () => {
  it('종료가 시작보다 이르면 자정을 넘긴 근무다', () => {
    expect(crossesMidnight('22:00', '06:00')).toBe(true)
    expect(crossesMidnight('09:00', '18:00')).toBe(false)
  })

  it('24:00 종료는 그날의 끝이지 익일이 아니다', () => {
    expect(crossesMidnight('18:00', '24:00')).toBe(false)
    expect(crossesMidnight('00:00', '24:00')).toBe(false)
  })

  it('24시간을 꽉 채우면 종일 근무', () => {
    expect(isFullDay('00:00', '24:00')).toBe(true)
    expect(isFullDay('09:00', '09:00')).toBe(true)
    expect(isFullDay('09:00', '18:00')).toBe(false)
  })
})

describe('formatTimeRange', () => {
  it('종일 근무는 00:00~24:00으로 통일해 보여준다', () => {
    expect(formatTimeRange('00:00', '24:00')).toBe('00:00~24:00')
    expect(formatTimeRange('00:00', '00:00')).toBe('00:00~24:00')
  })

  it('자정을 넘기면 (익일)을 붙인다', () => {
    expect(formatTimeRange('22:00', '06:00')).toBe('22:00~06:00 (익일)')
  })

  it('같은 날 안에서 끝나면 그대로 표기하고 초 단위는 자른다', () => {
    expect(formatTimeRange('09:00', '18:00')).toBe('09:00~18:00')
    expect(formatTimeRange('09:00:00', '18:00:00')).toBe('09:00~18:00')
  })
})

describe('resolveBreakMinutes', () => {
  it('둘 다 없으면 기본 휴게시간', () => {
    expect(DEFAULT_BREAK_MINUTES).toBe(60)
    expect(resolveBreakMinutes(null, null)).toBe(60)
    expect(resolveBreakMinutes(undefined, undefined)).toBe(60)
  })

  it('파트에 설정된 휴게시간이 기본값을 대신한다', () => {
    expect(resolveBreakMinutes(null, 30)).toBe(30)
    expect(resolveBreakMinutes(null, 90)).toBe(90)
  })

  it('파트 휴게 0분은 "미설정"으로 읽어 기본값으로 되돌린다', () => {
    // roster_shifts.break_minutes는 NOT NULL DEFAULT 0 — 0은 "휴게 없음"이 아니라 한 번도 설정하지 않은 상태다.
    // 여기서 0을 그대로 쓰면 기존 파트 전부가 소급해서 휴게 미차감이 되어 급여가 어긋난다.
    expect(resolveBreakMinutes(null, 0)).toBe(60)
  })

  it('근무일별 오버라이드가 파트 설정보다 우선한다 (0 포함)', () => {
    expect(resolveBreakMinutes(0, 30)).toBe(0)
    expect(resolveBreakMinutes(45, 30)).toBe(45)
  })
})

describe('paidMinutes', () => {
  it('오버라이드가 없으면 기본 휴게시간을 차감한다', () => {
    expect(DEFAULT_BREAK_MINUTES).toBe(60)
    expect(paidMinutes('09:00', '18:00', null, null)).toBe(480)
    expect(paidMinutes('09:00', '18:00', undefined, undefined)).toBe(480)
  })

  it('파트에 설정된 휴게시간을 차감한다', () => {
    // 홍대 AK 오후 파트(16:00~22:00, 휴게 30분) = 실 근무 5.5h
    expect(paidMinutes('16:00', '22:00', null, 30)).toBe(330)
    expect(paidMinutes('09:00', '18:00', null, 0)).toBe(480)
  })

  it('휴게시간 오버라이드를 적용한다 (0 포함)', () => {
    expect(paidMinutes('09:00', '18:00', 0, null)).toBe(540)
    expect(paidMinutes('09:00', '18:00', 30, null)).toBe(510)
    expect(paidMinutes('09:00', '18:00', 90, null)).toBe(450)
    // 근무일별 오버라이드가 파트 설정을 덮어쓴다
    expect(paidMinutes('09:00', '18:00', 0, 30)).toBe(540)
  })

  it('휴게시간이 근무시간보다 길면 음수가 아니라 0', () => {
    expect(paidMinutes('09:00', '09:30', null, null)).toBe(0)
    expect(paidMinutes('09:00', '10:00', 120, null)).toBe(0)
    expect(paidMinutes('09:00', '09:20', null, 30)).toBe(0)
  })

  it('종일 근무도 휴게를 차감한다', () => {
    expect(paidMinutes('00:00', '24:00', null, null)).toBe(MINUTES_IN_DAY - 60)
  })

  it('야간 근무에도 휴게 차감이 적용된다', () => {
    expect(paidMinutes('22:00', '06:00', null, null)).toBe(420)
    expect(paidMinutes('22:00', '06:00', 90, null)).toBe(390)
    expect(paidMinutes('22:00', '06:00', null, 30)).toBe(450)
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
