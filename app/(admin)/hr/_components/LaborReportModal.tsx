'use client'

// 근로내용 확인신고서(PDF) 미리보기 — 넣을 사람을 고르고(월 보수 50만 원 이하는 처음부터 빠져 있다),
// 신고일·일평균 근로시간 칸 표기를 정한 뒤 그대로 내려받는다. 서식은 LaborReportDocument.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import type { InsuranceReportRow } from '@/app/actions/payroll'
import { isDefaultReportTarget, LABOR_REPORT_MIN_PAY } from '@/lib/insuranceReport'
import { kstToday } from '@/lib/date'
import { showMsg } from '@/lib/toast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useModalKeyboard } from '@/lib/useModalKeyboard'
import LaborReportDocument, { type LaborHoursMode } from './LaborReportDocument'

const PdfPreview = dynamic(() => import('@/components/PDFPreviewPanel').then(m => m.PdfPreview), { ssr: false })

const PER_PAGE = 4

interface Props {
  rows: InsuranceReportRow[]
  year: number
  month: number // 0-indexed
  onClose: () => void
}

export default function LaborReportModal({ rows, year, month, onClose }: Props) {
  useBodyScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)
  useModalKeyboard({ active: true, onClose, containerRef: panelRef })

  // 처음엔 월 보수 50만 원 초과만 체크 — 키는 이름+주민번호(같은 이름이 둘이어도 구분)
  const keyOf = (r: InsuranceReportRow) => `${r.name}|${r.residentId ?? ''}|${r.phone ?? ''}`
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.filter(r => isDefaultReportTarget(r.pay)).map(keyOf)))
  const [reportDate, setReportDate] = useState(kstToday())
  const [hoursMode, setHoursMode] = useState<LaborHoursMode>('average')
  const [downloading, setDownloading] = useState(false)

  const chosen = useMemo(() => rows.filter(r => selected.has(keyOf(r))), [rows, selected])
  const pages = Math.max(1, Math.ceil(chosen.length / PER_PAGE))

  // 체크할 때마다 PDF를 다시 그리면 무겁다 — 마지막 변경 후 500ms 뒤에 미리보기를 갱신한다
  const [previewProps, setPreviewProps] = useState({ chosen, reportDate, hoursMode })
  useEffect(() => {
    const t = setTimeout(() => setPreviewProps({ chosen, reportDate, hoursMode }), 500)
    return () => clearTimeout(t)
  }, [chosen, reportDate, hoursMode])
  const previewDoc = useMemo(
    () => <LaborReportDocument rows={previewProps.chosen} year={year} month={month} reportDate={previewProps.reportDate} hoursMode={previewProps.hoursMode} />,
    [previewProps, year, month],
  )

  const toggle = (r: InsuranceReportRow) => setSelected(prev => {
    const next = new Set(prev)
    const k = keyOf(r)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })
  const selectWhere = (pred: (r: InsuranceReportRow) => boolean) => setSelected(new Set(rows.filter(pred).map(keyOf)))

  const download = async () => {
    if (chosen.length === 0) { showMsg('신고서에 넣을 사람을 골라주세요'); return }
    setDownloading(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const blob = await pdf(<LaborReportDocument rows={chosen} year={year} month={month} reportDate={reportDate} hoursMode={hoursMode} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `근로내용확인신고서_${year}년${month + 1}월분.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      showMsg(`PDF를 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloading(false)
    }
  }

  const segBtn = (active: boolean) =>
    `flex-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer border transition ${
      active ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline hover:bg-canvas-soft'
    }`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[1100px] rounded-xl shadow-level-2 border border-hairline flex flex-col md:flex-row overflow-hidden"
        style={{ height: '90vh' }}
      >
        {/* 왼쪽: 넣을 사람·옵션 */}
        <div className="flex flex-col w-full md:w-[380px] shrink-0 border-b md:border-b-0 md:border-r border-hairline min-h-0 max-h-[45vh] md:max-h-none">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-canvas-soft">
            <div>
              <h3 className="m-0 text-[15px] font-bold text-ink">근로내용 확인신고서</h3>
              <p className="m-0 text-[11px] text-ink-muted">{year}년 {month + 1}월분 · 일용근로자용</p>
            </div>
            <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink leading-none w-8 h-8">×</button>
          </div>

          <div className="px-4 py-3 border-b border-hairline flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => selectWhere(r => isDefaultReportTarget(r.pay))} className="px-2 py-1 rounded-full border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft">
                {LABOR_REPORT_MIN_PAY / 10_000}만 원 초과만
              </button>
              <button onClick={() => selectWhere(() => true)} className="px-2 py-1 rounded-full border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft">전체 선택</button>
              <button onClick={() => selectWhere(() => false)} className="px-2 py-1 rounded-full border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft">전체 해제</button>
            </div>
            <label className="flex items-center justify-between gap-2 text-[12px] text-ink-secondary">
              신고일
              <input
                type="date"
                value={reportDate}
                onChange={e => { if (e.target.value) setReportDate(e.target.value) }}
                className="px-2 py-1 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700"
              />
            </label>
            <div className="flex items-center justify-between gap-2 text-[12px] text-ink-secondary">
              <span className="shrink-0">일평균 근로시간 칸</span>
              <div className="flex gap-1 w-[160px]">
                <button className={segBtn(hoursMode === 'average')} onClick={() => setHoursMode('average')}>하루 평균</button>
                <button className={segBtn(hoursMode === 'total')} onClick={() => setHoursMode('total')}>총 시간</button>
              </div>
            </div>
          </div>

          <ul className="m-0 p-0 list-none overflow-y-auto flex-1 min-h-0">
            {rows.map(r => {
              const on = selected.has(keyOf(r))
              const low = !isDefaultReportTarget(r.pay)
              return (
                <li key={keyOf(r)} className="border-b border-hairline last:border-0">
                  <label className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-canvas-soft ${on ? '' : 'opacity-60'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r)} className="w-4 h-4 accent-primary-700 cursor-pointer shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-ink truncate">
                        {r.name}
                        {low && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-ink-muted border border-hairline">{LABOR_REPORT_MIN_PAY / 10_000}만 원 이하</span>}
                        {!r.residentId && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">주민번호 없음</span>}
                      </span>
                      <span className="block text-[11px] text-ink-muted tabular-nums">{r.days}일 · {r.hours}h · 직종 {r.jobCode}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-bold text-ink tabular-nums">{r.pay.toLocaleString('ko-KR')}원</span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="px-4 py-3 border-t border-hairline flex items-center gap-2">
            <span className="flex-1 text-[12px] text-ink-muted">{chosen.length}명 · {pages}장</span>
            <button
              onClick={download}
              disabled={downloading || chosen.length === 0}
              className="px-4 py-2 rounded-lg bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? '만드는 중…' : 'PDF 내려받기'}
            </button>
          </div>
        </div>

        {/* 오른쪽: 미리보기 */}
        <div className="flex-1 min-h-0 bg-canvas-soft">
          {chosen.length === 0
            ? <div className="flex items-center justify-center h-full text-ink-muted text-sm">왼쪽에서 신고서에 넣을 사람을 골라주세요.</div>
            : <PdfPreview document={previewDoc} title="근로내용 확인신고서 미리보기" />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
