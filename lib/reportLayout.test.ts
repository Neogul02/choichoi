import { describe, it, expect } from 'vitest'
import { packReportSections, type LayoutSection } from './reportLayout'

type C = 'a' | 'b' | 'c' | 'd' | 'wide'
const chart = (id: C, width?: 'full' | 'half'): LayoutSection<C> => ({ id, kind: 'chart', chartType: id, width })
const text = (id: string, content: string): LayoutSection<C> => ({ id, kind: 'text', content })
const defaults = (c: C) => (c === 'wide' ? 'full' : 'half')

const shape = (rows: ReturnType<typeof packReportSections<C>>) =>
  rows.map((r) => (r.kind === 'full' ? r.block.key : `${r.left.key}|${r.right?.key ?? '-'}`))

describe('packReportSections', () => {
  it('compact: 연속된 half 두 개를 한 행으로 묶고 full은 단독 행', () => {
    const rows = packReportSections([chart('a'), chart('b'), chart('wide'), chart('c'), chart('d')], 'compact', defaults)
    expect(shape(rows)).toEqual(['a|b', 'wide', 'c|d'])
  })

  it('짝이 없는 half는 뒤쪽 half를 당겨오지 않고 오른쪽을 비운다', () => {
    const rows = packReportSections([chart('a'), chart('wide'), chart('b')], 'compact', defaults)
    expect(shape(rows)).toEqual(['a|-', 'wide', 'b|-'])
  })

  it('섹션에 지정한 폭이 기본값보다 우선한다', () => {
    const rows = packReportSections([chart('a', 'full'), chart('b'), chart('wide', 'half')], 'compact', defaults)
    expect(shape(rows)).toEqual(['a', 'b|wide'])
  })

  it('텍스트 블록은 바로 앞 차트에 붙고, 빈 텍스트는 버린다', () => {
    const rows = packReportSections([chart('a'), text('t1', ' 메모 '), text('t2', '   '), chart('b')], 'compact', defaults)
    expect(shape(rows)).toEqual(['a|b'])
    expect(rows[0].kind === 'pair' && rows[0].left.texts).toEqual(['메모'])
  })

  it('첫 섹션이 텍스트면 메모 전용 full 블록이 되고, 내용이 비면 행을 만들지 않는다', () => {
    expect(shape(packReportSections([text('t', '서문'), chart('a')], 'compact', defaults))).toEqual(['t', 'a|-'])
    expect(packReportSections([text('t', '')], 'compact', defaults)).toEqual([])
  })

  it('standard·onePerPage는 지정 폭과 무관하게 전부 full', () => {
    for (const layout of ['standard', 'onePerPage'] as const) {
      expect(shape(packReportSections([chart('a', 'half'), chart('b')], layout, defaults))).toEqual(['a', 'b'])
    }
  })
})
