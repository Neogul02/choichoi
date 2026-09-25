import { describe, it, expect } from 'vitest'
import { popupsOnDate, popupTintGradient, type CalendarPopup } from './popupPeriod'

const popup = (over: Partial<CalendarPopup> = {}): CalendarPopup => ({
  id: 1,
  name: '홍대AK',
  start_date: '2025-10-02',
  end_date: '2025-10-15',
  colorIdx: 0,
  ...over,
})

describe('popupsOnDate', () => {
  const popups = [
    popup({ id: 1, name: '홍대AK', start_date: '2025-10-02', end_date: '2025-10-15' }),
    popup({ id: 2, name: '분당서현AK', start_date: '2025-10-09', end_date: '2025-10-30', colorIdx: 1 }),
  ]

  it('시작일·종료일 당일도 운영 중으로 본다', () => {
    expect(popupsOnDate(popups, '2025-10-02').map(p => p.id)).toEqual([1])
    expect(popupsOnDate(popups, '2025-10-15').map(p => p.id)).toEqual([1, 2])
  })

  it('겹치는 날은 목록 순서를 유지한 채 모두 돌려준다', () => {
    expect(popupsOnDate(popups, '2025-10-10').map(p => p.id)).toEqual([1, 2])
  })

  it('기간 밖 날짜는 빈 배열', () => {
    expect(popupsOnDate(popups, '2025-10-01')).toEqual([])
    expect(popupsOnDate(popups, '2025-10-31')).toEqual([])
  })
})

describe('popupTintGradient', () => {
  it('운영 중인 팝업이 없으면 배경을 깔지 않는다', () => {
    expect(popupTintGradient([])).toBeUndefined()
  })

  it('한 팝업만 운영 중이면 칸 전체를 그 색으로 채운다', () => {
    expect(popupTintGradient(['#6366f124'])).toBe('linear-gradient(#6366f124, #6366f124)')
  })

  it('겹치는 팝업은 칸을 균등한 가로 띠로 나눈다', () => {
    expect(popupTintGradient(['#a', '#b'])).toBe('linear-gradient(to bottom, #a 0.00% 50.00%, #b 50.00% 100.00%)')
  })
})
