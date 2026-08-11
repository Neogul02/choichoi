'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePDF } from '@react-pdf/renderer'
import { PopupReportDocument, REPORT_CHART_LABELS } from '@/components/PopupReportDocument'
import type { PopupReportData, ReportChartType, ReportSection } from '@/components/PopupReportDocument'
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

// usePDF는 클라이언트 마운트 후에만 안전 — 데이터는 이미 상위(PopupStatsSection)에서 다 불러온 상태라
// 별도 fetch 없이 곧바로 렌더한다. 제목·본문 구성(차트 섹션 추가/삭제/순서·텍스트 블록)은 여기서 편집해
// 근로계약서 작성 모달과 동일하게 600ms 디바운스로 라이브 미리보기에 반영한다.
export default function PopupReportModal({ data, onClose }: Props) {
  useBodyScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)

  const [title, setTitle] = useState(data.popupName)
  const [sections, setSections] = useState<ReportSection[]>(data.sections)

  // 실제 매출 데이터가 있는 차트 종류만 "추가" 목록에 노출 — 데이터 없는 차트는 애초에 렌더되지 않는다
  const chartAvailability: Record<ReportChartType, boolean> = {
    dailyBar: data.dailySales.length > 0,
    cumulative: data.dailySales.length > 0,
    dayOfWeek: data.dayOfWeek.length > 0,
    hourly: data.hourly.some((h) => h.orderCount > 0 || h.revenue > 0),
    menuDonut: data.menuBreakdown.some((m) => m.totalRevenue > 0),
    dailyTable: true,
  }
  const usedChartTypes = new Set(sections.filter((s) => s.kind === 'chart').map((s) => s.chartType))
  const addableChartTypes = (Object.keys(REPORT_CHART_LABELS) as ReportChartType[])
    .filter((type) => chartAvailability[type] && !usedChartTypes.has(type))

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

  const [previewData, setPreviewData] = useState<PopupReportData>(data)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewData({ ...data, popupName: title.trim() || data.popupName, sections })
    }, 600)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, sections])

  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [instance, updateInstance] = usePDF({ document: <PopupReportDocument {...previewData} /> })

  useEffect(() => {
    updateInstance(<PopupReportDocument {...previewData} />)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewData])

  useModalKeyboard({ active: true, onClose, containerRef: panelRef })

  useEffect(() => {
    if (!instance.loading && instance.url) setDisplayUrl(instance.url)
  }, [instance.loading, instance.url])

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
              <div className="flex items-center justify-between mb-1.5">
                <p className="m-0 text-[11px] font-bold text-ink-muted uppercase tracking-wide">보고서 구성</p>
                <span className="text-[10px] text-ink-faint">텍스트는 바로 위 차트 아래에 붙습니다</span>
              </div>

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

              {addableChartTypes.length > 0 && (
                <div className="mt-2">
                  <p className="m-0 mb-1.5 text-[10px] text-ink-faint">차트 추가</p>
                  <div className="flex flex-wrap gap-1.5">
                    {addableChartTypes.map((type) => (
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
              )}
            </div>

            <p className="m-0 text-[10px] text-ink-faint leading-relaxed">수치·그래프는 실제 매출 데이터 기준으로 자동 생성되며 값 자체는 수정할 수 없습니다. 제목, 구성 순서, 텍스트 블록만 편집 가능합니다.</p>
          </div>

          <div className="flex-1 min-w-0 min-h-[480px] md:min-h-0 bg-canvas-soft flex flex-col">
            <div className="px-4 py-2 border-b border-hairline bg-canvas text-[11px] text-ink-muted font-semibold shrink-0">미리보기</div>
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
    </div>,
    document.body,
  )
}
