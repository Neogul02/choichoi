// 팝업 매출 보고서 본문 배치 — 사용자가 편집한 섹션 순서(차트·텍스트 블록)를 PDF의 행(Row)으로 묶는다.
// react-pdf에 의존하지 않는 순수 함수라 vitest로 검증한다.

export type ReportLayout = 'compact' | 'standard' | 'onePerPage'
export type SectionWidth = 'full' | 'half'

export type LayoutSection<C extends string> =
  | { id: string; kind: 'chart'; chartType: C; width?: SectionWidth }
  | { id: string; kind: 'text'; content: string }

/** 차트 하나와 그 바로 뒤에 붙은 텍스트 블록들 — PDF에서 한 카드로 같이 움직인다 */
export interface SectionBlock<C extends string> {
  key: string
  chartType: C | null
  width: SectionWidth
  texts: string[]
}

export type LayoutRow<C extends string> =
  | { key: string; kind: 'full'; block: SectionBlock<C> }
  | { key: string; kind: 'pair'; left: SectionBlock<C>; right: SectionBlock<C> | null }

/**
 * 1) 텍스트 블록은 바로 앞 차트에 붙인다(첫 섹션이 텍스트면 차트 없는 메모 블록).
 * 2) compact 모드에서만 연속된 half 블록 두 개를 한 행으로 묶는다. 순서를 지키는 게 우선이라
 *    짝이 없는 half는 뒤쪽 half를 당겨오지 않고 오른쪽을 비운 채 단독 행이 된다.
 * 메모 전용 블록과 standard·onePerPage 모드는 전부 full.
 */
export function packReportSections<C extends string>(
  sections: LayoutSection<C>[],
  layout: ReportLayout,
  defaultWidth: (chartType: C) => SectionWidth,
): LayoutRow<C>[] {
  const blocks: SectionBlock<C>[] = []
  for (const section of sections) {
    if (section.kind === 'chart') {
      const width = layout === 'compact' ? (section.width ?? defaultWidth(section.chartType)) : 'full'
      blocks.push({ key: section.id, chartType: section.chartType, width, texts: [] })
    } else {
      if (blocks.length === 0) blocks.push({ key: section.id, chartType: null, width: 'full', texts: [] })
      const content = section.content.trim()
      if (content) blocks[blocks.length - 1].texts.push(content)
    }
  }

  const rows: LayoutRow<C>[] = []
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.chartType === null && block.texts.length === 0) continue
    if (block.width === 'half') {
      const next = blocks[i + 1]
      if (next && next.width === 'half') {
        rows.push({ key: `${block.key}+${next.key}`, kind: 'pair', left: block, right: next })
        i++
      } else {
        rows.push({ key: block.key, kind: 'pair', left: block, right: null })
      }
    } else {
      rows.push({ key: block.key, kind: 'full', block })
    }
  }
  return rows
}
