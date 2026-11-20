import { describe, it, expect } from 'vitest'
import { popupDayIndex, sameDayOfRun, pastPopupsFor } from './popupDayCompare'

const cheong = { id: 33, name: '한화 청량리 #2', start_date: '2026-11-13', end_date: '2026-12-03' }
const daegu = { id: 30, name: '대구 신세계 #2', start_date: '2026-10-23', end_date: '2026-11-05' }
const gangnam = { id: 36, name: '강남 신세계', start_date: '2026-11-05', end_date: '2026-11-12' }

describe('지난 팝업 같은 일차', () => {
  it('운영 일차', () => {
    expect(popupDayIndex(cheong, '2026-11-13')).toBe(0)
    expect(popupDayIndex(cheong, '2026-11-20')).toBe(7)
    expect(popupDayIndex(cheong, '2026-11-12')).toBeNull()
  })
  it('청량리 8일차(11/20) ↔ 대구 #2 8일차(10/30)', () => {
    expect(sameDayOfRun(cheong, daegu, '2026-11-20')).toEqual({ date: '2026-10-30', dayNo: 8 })
  })
  it('비교 팝업이 그만큼 길지 않으면 null', () => {
    expect(sameDayOfRun(cheong, gangnam, '2026-11-25')).toBeNull()
  })
  it('지난 팝업 목록 — 먼저 시작해 끝난 것만, 최근 끝난 순', () => {
    expect(pastPopupsFor(cheong, [daegu, gangnam, cheong], '2026-11-20').map(p => p.id)).toEqual([36, 30])
  })
  it('같은 매장 지난 회차가 있으면 그것만 (대구는 대구끼리)', () => {
    const daegu3 = { id: 38, name: '대구 신세계 #3', start_date: '2026-11-20', end_date: '2026-12-03' }
    const daegu1 = { id: 20, name: '대구 신세계', start_date: '2026-09-01', end_date: '2026-09-10' }
    expect(pastPopupsFor(daegu3, [daegu, gangnam, cheong, daegu3, daegu1], '2026-11-20').map(p => p.id)).toEqual([30, 20])
    expect(sameDayOfRun(daegu3, daegu, '2026-11-20')).toEqual({ date: '2026-10-23', dayNo: 1 })
  })
})
