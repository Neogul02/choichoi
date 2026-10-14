import { describe, it, expect } from 'vitest'
import {
  kstDateOf, kstHHMMOf, kstHHMMSSOf, kstSlashDateOf, kstInstant, isWithinOpenWindow, resolveClockOutTimes,
  requiredBreakMinutes, isBreakShort, payrollMonthKey, isAttendanceBreak, OPEN_WINDOW_HOURS,
} from './attendance'

// KST 벽시계 시각 → 순간(ms)
const at = (date: string, hhmmss: string) => Date.parse(`${date}T${hhmmss}+09:00`)

describe('KST 변환', () => {
  it('UTC 자정 전후에도 KST 날짜·시각으로 읽는다', () => {
    expect(kstDateOf(Date.parse('2026-10-13T15:30:00Z'))).toBe('2026-10-14')
    expect(kstHHMMOf(Date.parse('2026-10-13T15:30:59Z'))).toBe('00:30')
  })
  it('화면 표시용은 초까지, 날짜는 슬래시로', () => {
    expect(kstHHMMSSOf(Date.parse('2026-10-13T15:30:59Z'))).toBe('00:30:59')
    expect(kstSlashDateOf(Date.parse('2026-10-13T15:30:59Z'))).toBe('2026/10/14')
  })
  it('kstInstant는 KST 날짜+시각의 순간이다', () => {
    expect(kstInstant('2026-10-14', '10:00')).toBe(at('2026-10-14', '10:00:00'))
    expect(kstInstant('2026-10-14', '24:00')).toBe(at('2026-10-15', '00:00:00'))
  })
})

describe('resolveClockOutTimes', () => {
  const base = { workDate: '2026-10-14', plannedStart: '10:00' }

  it('계획보다 일찍 출근하면 계획 시작부터 인정한다', () => {
    expect(resolveClockOutTimes({ ...base, clockInMs: at('2026-10-14', '09:48:12'), clockOutMs: at('2026-10-14', '20:37:40') }))
      .toEqual({ ok: true, startTime: '10:00', endTime: '20:37' })
  })

  it('늦게 출근하면 실제 출근 시각부터', () => {
    expect(resolveClockOutTimes({ ...base, clockInMs: at('2026-10-14', '10:12:40'), clockOutMs: at('2026-10-14', '18:00:00') }))
      .toEqual({ ok: true, startTime: '10:12', endTime: '18:00' })
  })

  it('자정을 넘긴 퇴근은 익일 시각으로 기록된다', () => {
    expect(resolveClockOutTimes({ workDate: '2026-10-14', plannedStart: '15:00', clockInMs: at('2026-10-14', '14:55:00'), clockOutMs: at('2026-10-15', '00:30:00') }))
      .toEqual({ ok: true, startTime: '15:00', endTime: '00:30' })
  })

  it('계획 시작 전에 퇴근하면 거부한다 — 그대로 쓰면 24시간 근무로 계산된다', () => {
    expect(resolveClockOutTimes({ ...base, clockInMs: at('2026-10-14', '09:48:00'), clockOutMs: at('2026-10-14', '09:55:00') }))
      .toEqual({ ok: false, reason: 'before_start', payStartTime: '10:00' })
  })

  it('같은 분 안에 퇴근하면 거부한다 — 10:12~10:12는 24시간으로 읽힌다', () => {
    const r = resolveClockOutTimes({ ...base, clockInMs: at('2026-10-14', '10:12:05'), clockOutMs: at('2026-10-14', '10:12:50') })
    expect(r.ok).toBe(false)
  })

  it('계획이 없으면 실제 출근 시각부터', () => {
    expect(resolveClockOutTimes({ workDate: '2026-10-14', plannedStart: null, clockInMs: at('2026-10-14', '09:48:00'), clockOutMs: at('2026-10-14', '17:00:00') }))
      .toEqual({ ok: true, startTime: '09:48', endTime: '17:00' })
  })
})

describe('isWithinOpenWindow', () => {
  it(`출근 후 ${OPEN_WINDOW_HOURS}시간이 지나면 퇴근할 수 없다`, () => {
    const inMs = at('2026-10-14', '10:00:00')
    expect(isWithinOpenWindow(inMs, at('2026-10-15', '01:59:00'))).toBe(true)
    expect(isWithinOpenWindow(inMs, at('2026-10-15', '02:00:00'))).toBe(false)
    expect(isWithinOpenWindow(inMs, at('2026-10-15', '09:59:00'))).toBe(false)
  })
})

describe('법정 휴게', () => {
  it('근로 8시간 이상은 1시간, 4시간 이상은 30분', () => {
    expect(requiredBreakMinutes('10:00', '20:00', 60)).toBe(60) // 9h 근로
    expect(requiredBreakMinutes('10:00', '18:00', 60)).toBe(30) // 7h 근로
    expect(requiredBreakMinutes('10:00', '13:00', 0)).toBe(0)
  })
  it('휴게를 안 고른 8시간 근무는 미달', () => {
    expect(isBreakShort('10:00', '18:30', 0)).toBe(true)
    expect(isBreakShort('10:00', '18:30', 60)).toBe(false)
    expect(isBreakShort('10:00', '14:00', 0)).toBe(true)
    expect(isBreakShort('10:00', '13:59', 0)).toBe(false)
  })
})

describe('기타', () => {
  it('정산 키의 월은 0부터 센다 (payroll.ts와 동일)', () => {
    expect(payrollMonthKey('2026-10-14')).toBe('month:2026-9')
    expect(payrollMonthKey('2026-01-01')).toBe('month:2026-0')
  })
  it('휴게 선택지는 0·30·60만', () => {
    expect(isAttendanceBreak(30)).toBe(true)
    expect(isAttendanceBreak(45)).toBe(false)
    expect(isAttendanceBreak('60')).toBe(false)
  })
})
