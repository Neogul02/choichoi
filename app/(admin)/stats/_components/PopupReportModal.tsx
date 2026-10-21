'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePDF } from '@react-pdf/renderer'
import {
  PopupReportDocument, REPORT_CHART_LABELS, REPORT_CHART_GROUPS, REPORT_CHART_DEFAULT_WIDTH, REPORT_CHART_FULL_ONLY,
  REPORT_LAYOUT_LABELS, isReportChartAvailable,
} from '@/components/PopupReportDocument'
import type { PopupReportData, ReportChartType, ReportLayout, ReportSection, SectionWidth } from '@/components/PopupReportDocument'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useModalKeyboard } from '@/lib/useModalKeyboard'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface Props {
  data: PopupReportData
  onClose: () => void
}

const labelCls = 'text-[10px] font-semibold text-ink-muted mb-0.5 block'
const inputCls = 'w-full px-2.5 py-1.5 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700'

function moveItem<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= arr.length) return arr
  const next = [...arr]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

// react-pdf(pdfkit) 출력은 페이지 객체 사전이 압축되지 않아 그대로 셀 수 있다 — pdf.js를 띄우지 않고 페이지 수만 얻는다
async function countPdfPages(blob: Blob): Promise<number> {
  const text = await blob.text()
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}

const segBtn = (active: boolean) =>
  `flex-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer border transition ${
    active ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline hover:bg-canvas-soft'
  }`

// usePDF는 클라이언트 마운트 후에만 안전 — 데이터는 이미 상위(PopupStatsSection)에서 다 불러온 상태라
// 별도 fetch 없이 곧바로 렌더한다. 제목·본문 구성(차트 섹션 추가/삭제/순서·텍스트 블록)은 여기서 편집해
// 근로계약서 작성 모달과 동일하게 600ms 디바운스로 라이브 미리보기에 반영한다.
export default function PopupReportModal({ data, onClose }: Props) {
  useBodyScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState(data.popupName)
  const [sections, setSections] = useState<ReportSection[]>(data.sections)
  const [layout, setLayout] = useState<ReportLayout>(data.layout ?? 'compact')
  const [showInsights, setShowInsights] = useState(data.showInsights ?? true)

  // 실제 매출 데이터가 있는 차트 종류만 "추가" 목록에 노출 — PDF 렌더와 같은 기준(isReportChartAvailable)
  const usedChartTypes = new Set(sections.filter((s) => s.kind === 'chart').map((s) => s.chartType))
  const addableGroups = REPORT_CHART_GROUPS
    .map((g) => ({ ...g, types: g.types.filter((type) => isReportChartAvailable(type, data) && !usedChartTypes.has(type)) }))
    .filter((g) => g.types.length > 0)

  const addChart = (chartType: ReportChartType) => {
    setSections((prev) => [...prev, { id: crypto.randomUUID(), kind: 'chart', chartType }])
  }
  const addTextBlock = () => {
    setSections((prev) => [...prev, { id: crypto.randomUUID(), kind: 'text', content: '' }])
  }
  const removeSection = (id: string) => setSections((prev) => prev.filter((s) => s.id !== id))
  const moveSection = (index: number, direction: -1 | 1) => setSections((prev) => moveItem(prev, index, direction))
  const updateTextContent = (id: string, content: string) =>
    setSections((prev) => prev.map((s) => (s.id === id && s.kind === 'text' ? { ...s, content } : s)))
  const setSectionWidth = (id: string, width: SectionWidth) =>
    setSections((prev) => prev.map((s) => (s.id === id && s.kind === 'chart' ? { ...s, width } : s)))
  // 추천 구성은 작성한 텍스트 블록까지 덮어쓴다 — 쓴 내용이 있을 때만 확인을 거친다
  const [confirmReset, setConfirmReset] = useState(false)
  const resetToRecommended = () => {
    if (sections.some((s) => s.kind === 'text' && s.content.trim())) setConfirmReset(true)
    else setSections(data.sections)
  }

  const [previewData, setPreviewData] = useState<PopupReportData>(data)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewData({ ...data, popupName: title.trim() || data.popupName, sections, layout, showInsights })
    }, 600)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, sections, layout, showInsights])

  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [instance, updateInstance] = usePDF({ document: <PopupReportDocument {...previewData} /> })

  useEffect(() => {
    updateInstance(<PopupReportDocument {...previewData} />)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewData])

  useModalKeyboard({ active: !confirmReset, onClose, containerRef: panelRef })

  useEffect(() => {
    if (!instance.loading && instance.url) setDisplayUrl(instance.url)
  }, [instance.loading, instance.url])

  const [pageCount, setPageCount] = useState<number | null>(null)
  useEffect(() => {
    if (instance.loading || !instance.blob) return undefined
    let cancelled = false
    countPdfPages(instance.blob).then((n) => { if (!cancelled) setPageCount(n) }).catch(() => {})
    return () => { cancelled = true }
  }, [instance.loading, instance.blob])

  const fileName = `${previewData.popupName}_매출분석보고서_${data.startDate}_${data.endDate}.pdf`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[1280px] h-[95vh] rounded-xl shadow-level-2 border border-hairline flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-canvas-soft shrink-0">
          <div>
            <h3 className="m-0 text-[15px] font-bold text-ink">매출 분석 보고서</h3>
            <p className="m-0 text-[11px] text-ink-faint mt-0.5">{data.startDate} ~ {data.endDate}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none">×</button>
        </div>

        {/* 본문: 좌측 편집 폼 + 우측 실시간 미리보기 — 모바일은 세로 스택 */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="w-full md:w-[340px] shrink-0 md:overflow-y-auto p-4 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-hairline [scrollbar-width:thin]">
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">보고서 제목</p>
              <label className={labelCls}>표지에 표시될 이름</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder={data.popupName} />
            </div>

            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">레이아웃</p>
              <div className="flex gap-1">
                {(Object.keys(REPORT_LAYOUT_LABELS) as ReportLayout[]).map((key) => (
                  <button key={key} type="button" onClick={() => setLayout(key)} className={segBtn(layout === key)}>
                    {REPORT_LAYOUT_LABELS[key]}
                  </button>
                ))}
              </div>
              <p className="m-0 mt-1 text-[10px] text-ink-faint leading-relaxed">
                {layout === 'compact' && '반 폭(½) 블록 두 개를 한 줄에 놓고 페이지를 이어서 채웁니다.'}
                {layout === 'standard' && '모든 블록을 전체 폭으로 이어서 배치합니다.'}
                {layout === 'onePerPage' && '블록마다 한 페이지를 씁니다 — 발표 자료용.'}
              </p>
              <label className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-secondary cursor-pointer">
                <input type="checkbox" checked={showInsights} onChange={(e) => setShowInsights(e.target.checked)} className="accent-primary-700" />
                표지에 핵심 인사이트 자동 요약 넣기
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="m-0 text-[11px] font-bold text-ink-muted uppercase tracking-wide">보고서 구성</p>
                <button type="button" onClick={resetToRecommended} className="bg-transparent border-none p-0 text-[10px] font-semibold text-primary-700 cursor-pointer hover:underline">
                  추천 구성으로
                </button>
              </div>
              <p className="m-0 mb-1.5 text-[10px] text-ink-faint">텍스트는 바로 위 차트 카드 안에 이어 붙습니다</p>
              <div className="flex flex-col gap-1.5">
                {sections.length === 0 && (
                  <p className="m-0 text-[11px] text-ink-faint py-3 text-center border border-dashed border-hairline rounded-lg">
                    구성 항목이 없습니다. 아래에서 차트나 텍스트를 추가하세요.
                  </p>
                )}
                {sections.map((section, i) => (
                  <div key={section.id} className="rounded-lg border border-hairline bg-canvas-soft p-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 text-[11px] font-semibold text-ink-secondary truncate">
                        {section.kind === 'chart' ? REPORT_CHART_LABELS[section.chartType] : '텍스트 블록'}
                      </span>
                      {section.kind === 'chart' && layout === 'compact' && !REPORT_CHART_FULL_ONLY.has(section.chartType) && (() => {
                        const width = section.width ?? REPORT_CHART_DEFAULT_WIDTH[section.chartType]
                        return (
                          <button
                            type="button"
                            onClick={() => setSectionWidth(section.id, width === 'half' ? 'full' : 'half')}
                            aria-label={width === 'half' ? '전체 폭으로' : '반 폭으로'}
                            title={width === 'half' ? '반 폭 — 눌러서 전체 폭으로' : '전체 폭 — 눌러서 반 폭으로'}
                            className="h-5 px-1.5 flex items-center justify-center rounded border border-hairline bg-canvas text-ink-muted text-[10px] font-semibold cursor-pointer hover:bg-canvas-soft"
                          >
                            {width === 'half' ? '½' : '전체'}
                          </button>
                        )
                      })()}
                      <button
                        type="button"
                        onClick={() => moveSection(i, -1)}
                        disabled={i === 0}
                        aria-label="위로 이동"
                        className="w-5 h-5 flex items-center justify-center rounded border border-hairline bg-canvas text-ink-muted text-[10px] cursor-pointer hover:bg-canvas-soft disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(i, 1)}
                        disabled={i === sections.length - 1}
                        aria-label="아래로 이동"
                        className="w-5 h-5 flex items-center justify-center rounded border border-hairline bg-canvas text-ink-muted text-[10px] cursor-pointer hover:bg-canvas-soft disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSection(section.id)}
                        aria-label="삭제"
                        className="w-5 h-5 flex items-center justify-center rounded border border-red-200 bg-canvas text-red-500 text-[11px] cursor-pointer hover:bg-red-50"
                      >
                        ×
                      </button>
                    </div>
                    {section.kind === 'text' && (
                      <textarea
                        value={section.content}
                        onChange={(e) => updateTextContent(section.id, e.target.value)}
                        placeholder="바로 위 차트(또는 표) 아래에 이어서 표시될 문단입니다. 빈 줄로 문단을 구분할 수 있습니다."
                        className="w-full min-h-[70px] px-2 py-1.5 border border-hairline rounded-lg text-[11.5px] bg-canvas focus:outline-none focus:border-primary-700 resize-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={addTextBlock}
                className="w-full py-1.5 rounded-lg border border-dashed border-primary-700/40 bg-canvas text-[11px] font-semibold text-primary-700 cursor-pointer hover:bg-primary-700/5 transition"
              >
                + 텍스트 블록 추가
              </button>

              {addableGroups.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="m-0 text-[10px] text-ink-faint">차트·정보 추가</p>
                  {addableGroups.map((group) => (
                    <div key={group.label}>
                      <p className="m-0 mb-1 text-[10px] font-semibold text-ink-muted">{group.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.types.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => addChart(type)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#f5f6f7] text-ink-muted border border-hairline hover:bg-canvas-soft cursor-pointer transition"
                          >
                            + {REPORT_CHART_LABELS[type]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="m-0 text-[10px] text-ink-faint leading-relaxed">수치·그래프는 실제 매출 데이터 기준으로 자동 생성되며 값 자체는 수정할 수 없습니다. 제목, 레이아웃, 구성 순서·폭, 텍스트 블록만 편집 가능합니다.</p>
          </div>

          <div className="flex-1 min-w-0 min-h-[480px] md:min-h-0 bg-canvas-soft flex flex-col">
            <div className="px-4 py-2 border-b border-hairline bg-canvas text-[11px] text-ink-muted font-semibold shrink-0 flex items-center justify-between">
              <span>미리보기</span>
              {pageCount !== null && <span className="text-ink-faint font-medium">표지 포함 총 {pageCount}페이지</span>}
            </div>
            <div className="flex-1 min-h-0 relative">
              {instance.error ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
                  <span className="text-red-500 text-sm font-semibold">PDF 렌더링 오류</span>
                  <span className="text-red-400 text-xs text-center break-all">{String(instance.error)}</span>
                </div>
              ) : !displayUrl ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-6 h-6 border-2 border-primary-700 border-t-transparent rounded-full animate-spin" />
                  <span className="text-ink-muted text-sm">보고서 생성 중...</span>
                </div>
              ) : (
                <iframe src={displayUrl} className="w-full h-full border-none" title="매출 분석 보고서 미리보기" />
              )}
              {instance.loading && displayUrl && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-canvas/90 border border-hairline rounded-full px-2.5 py-1 shadow text-[10px] text-ink-muted">
                  <div className="w-3 h-3 border border-primary-700 border-t-transparent rounded-full animate-spin" />
                  갱신 중...
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-hairline bg-canvas-soft shrink-0">
          <p className="m-0 text-[11px] text-ink-faint">그래프·수치·상세 내역이 포함된 보고서입니다</p>
          <div className="flex gap-2">
            {displayUrl && (
              <a
                href={displayUrl}
                download={fileName}
                className="px-4 py-2 rounded-lg bg-primary-700 text-white text-[12px] font-bold no-underline inline-block cursor-pointer hover:bg-primary-800 transition"
              >
                PDF 다운로드
              </a>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-canvas border border-hairline text-[12px] font-semibold text-ink-secondary cursor-pointer hover:bg-canvas-soft transition">닫기</button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="추천 구성으로 되돌릴까요?"
        description="지금 구성과 작성한 텍스트 블록이 모두 사라지고 기본 추천 구성으로 바뀝니다."
        confirmLabel="되돌리기"
        danger
        onConfirm={() => { setSections(data.sections); setConfirmReset(false) }}
        onClose={() => setConfirmReset(false)}
      />
    </div>,
    document.body,
  )
}
