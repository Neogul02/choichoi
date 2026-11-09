import { describe, it, expect } from 'vitest'
import { buildPeriodGrid } from './periodGrid'

describe('buildPeriodGrid', () => {
  it('11/13(금)~12/3(목) — 11/8(일) 주부터 12/5(토) 주까지 4주, 기간 밖은 빈 칸', () => {
    const g = buildPeriodGrid('2026-11-13', '2026-12-03')
    expect(g).toHaveLength(28)
    expect(g.slice(0, 5)).toEqual([null, null, null, null, null]) // 11/8~11/12
    expect(g[5]).toBe('2026-11-13')
    expect(g.filter(Boolean)).toHaveLength(21)
    expect(g[25]).toBe('2026-12-03')
    expect(g.slice(26)).toEqual([null, null])
  })
  it('일요일 시작·토요일 끝이면 빈 칸이 없다', () => {
    const g = buildPeriodGrid('2026-11-08', '2026-11-14')
    expect(g).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
  })
  it('하루짜리 기간', () => {
    const g = buildPeriodGrid('2026-11-11', '2026-11-11')
    expect(g).toHaveLength(7)
    expect(g.filter(Boolean)).toEqual(['2026-11-11'])
  })
  it('잘못된 기간이면 빈 배열', () => {
    expect(buildPeriodGrid('2026-12-03', '2026-11-13')).toEqual([])
    expect(buildPeriodGrid('', '2026-11-13')).toEqual([])
  })
})
