import { describe, it, expect } from 'vitest'
import {
  buildClosedDayIndex, isClosedDay, closedDayReason, hasClosedPopupOnDate,
  weekdayDatesInRange, excludeClosedDays,
} from './closedDays'

// 분당 AK(팝업 26)는 2026-10-09~29 운영이고 매주 월요일이 정기휴점이다
const MON1 = '2026-10-12'
const MON2 = '2026-10-19'
const TUE1 = '2026-10-13'

const index = buildClosedDayIndex([
  { popup_id: 26, closed_date: MON1, reason: '정기휴점' },
  { popup_id: 26, closed_date: MON2, reason: null },
])

describe('isClosedDay', () => {
  it('행이 있는 날만 휴무로 본다', () => {
    expect(isClosedDay(index, 26, MON1)).toBe(true)
    expect(isClosedDay(index, 26, TUE1)).toBe(false)
  })

  it('다른 팝업의 휴무일에 영향받지 않는다', () => {
    expect(isClosedDay(index, 29, MON1)).toBe(false)
  })

  // 주방은 팝업에 귀속되지 않는다 — 팝업이 쉬어도 준비·손질 일은 돌아간다
  it('주방(popupId null)은 항상 영업으로 본다', () => {
    expect(isClosedDay(index, null, MON1)).toBe(false)
  })

  it('인덱스가 아직 로드되지 않았으면 영업으로 본다', () => {
    expect(isClosedDay(undefined, 26, MON1)).toBe(false)
  })
})

describe('closedDayReason', () => {
  it('사유를 안 적은 휴무일은 null, 휴무일이 아니면 undefined', () => {
    expect(closedDayReason(index, 26, MON1)).toBe('정기휴점')
    expect(closedDayReason(index, 26, MON2)).toBeNull()
    expect(closedDayReason(index, 26, TUE1)).toBeUndefined()
  })
})

describe('hasClosedPopupOnDate', () => {
  it('여러 팝업 중 하나라도 쉬면 true', () => {
    expect(hasClosedPopupOnDate(index, [29, 26], MON1)).toBe(true)
    expect(hasClosedPopupOnDate(index, [29], MON1)).toBe(false)
    expect(hasClosedPopupOnDate(index, [], MON1)).toBe(false)
  })
})

describe('weekdayDatesInRange', () => {
  it('기간 안의 그 요일 날짜를 모두 돌려준다 (양끝 포함)', () => {
    // 2026-10-09(금) ~ 10-29(목) 사이의 월요일
    expect(weekdayDatesInRange('2026-10-09', '2026-10-29', 1)).toEqual([MON1, MON2, '2026-10-26'])
  })

  it('기간 끝이 그 요일이면 포함한다', () => {
    expect(weekdayDatesInRange(MON1, MON2, 1)).toEqual([MON1, MON2])
  })

  it('기간이 뒤집혀 있으면 빈 배열', () => {
    expect(weekdayDatesInRange(MON2, MON1, 1)).toEqual([])
  })
})

describe('excludeClosedDays', () => {
  it('휴무일만 걸러낸다', () => {
    expect(excludeClosedDays(index, 26, [MON1, TUE1, MON2])).toEqual([TUE1])
  })

  // 주방 일괄 배정이 팝업 휴무일 때문에 조용히 줄어들면 안 된다
  it('주방(popupId null)은 아무것도 걸러내지 않는다', () => {
    expect(excludeClosedDays(index, null, [MON1, TUE1])).toEqual([MON1, TUE1])
  })
})
