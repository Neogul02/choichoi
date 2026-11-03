'use client'

// 근로 자료 내보내기 미리보기 — 근로내용 확인신고서(PDF)·4대보험 자료(엑셀) 공용.
// 넣을 사람을 주방·캐셔로 나눠 고르고(월 보수 50만 원 이하는 처음부터 빠져 있다), 미리 본 뒤 내려받는다.
// PDF 서식은 LaborReportDocument, 엑셀은 insuranceExcel.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import type { InsuranceReportRow } from '@/app/actions/payroll'
import { formatResidentId, groupByRole, isDefaultReportTarget, LABOR_REPORT_MIN_PAY, REPORT_ROLE_LABEL } from '@/lib/insuranceReport'
import { kstToday } from '@/lib/date'
import { DAY_NAMES } from '@/lib/staffing'
import { showMsg } from '@/lib/toast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useModalKeyboard } from '@/lib/useModalKeyboard'
import LaborReportDocument, { type LaborHoursMode } from './LaborReportDocument'

const PdfPreview = dynamic(() => import('@/components/PDFPreviewPanel').then(m => m.PdfPreview), { ssr: false })

const PER_PAGE = 4
export type InsuranceExportKind = 'pdf' | 'excel'

interface Props {
  kind: InsuranceExportKind
  rows: InsuranceReportRow[]
  year: number
  month: number // 0-indexed
  onClose: () => void
}

// 이름·주민번호·전화로 한 사람을 가린다(같은 이름이 둘이어도 구분)
const keyOf = (r: InsuranceReportRow) => `${r.name}|${r.residentId ?? ''}|${r.phone ?? ''}`

export default function InsuranceExportModal({ kind, rows, year, month, onClose }: Props) {
  useBodyScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)
  useModalKeyboard({ active: true, onClose, containerRef: panelRef })

  const groups = useMemo(() => groupByRole(rows), [rows])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.filter(r => isDefaultReportTarget(r.pay)).map(keyOf)))
  const [reportDate, setReportDate] = useState(kstToday())
  const [hoursMode, setHoursMode] = useState<LaborHoursMode>('average')
  const [downloading, setDownloading] = useState(false)

  const chosen = useMemo(() => rows.filter(r => selected.has(keyOf(r))), [rows, selected])
  const pdfPages = groupByRole(chosen).reduce((n, g) => n + Math.ceil(g.rows.length / PER_PAGE), 0)

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

  const setMany = (list: InsuranceReportRow[], on: boolean) => setSelected(prev => {
    const next = new Set(prev)
    for (const r of list) { if (on) next.add(keyOf(r)); else next.delete(keyOf(r)) }
    return next
  })
  const selectWhere = (pred: (r: InsuranceReportRow) => boolean) => setSelected(new Set(rows.filter(pred).map(keyOf)))

  const download = async () => {
    if (chosen.length === 0) { showMsg('넣을 사람을 골라주세요'); return }
    setDownloading(true)
    try {
      if (kind === 'excel') {
        const { downloadInsuranceExcel } = await import('./insuranceExcel')
        await downloadInsuranceExcel(chosen, year, month)
      } else {
        const { pdf } = await import('@react-pdf/renderer')
        const blob = await pdf(<LaborReportDocument rows={chosen} year={year} month={month} reportDate={reportDate} hoursMode={hoursMode} />).toBlob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `근로내용확인신고서_${year}년${month + 1}월분.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
      const missing = chosen.filter(r => !r.residentId).length
      if (missing > 0) showMsg(`주민번호 미등록 ${missing}명은 빈칸·'(미등록)'으로 들어갔어요`)
    } catch (e) {
      showMsg(`파일을 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloading(false)
    }
  }

  const chip = 'px-2 py-1 rounded-full border border-hairline bg-canvas text-[11px] font-semibold text-ink-muted cursor-pointer hover:bg-canvas-soft'
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
              <h3 className="m-0 text-[15px] font-bold text-ink">{kind === 'pdf' ? '근로내용 확인신고서' : '4대보험 자료(엑셀)'}</h3>
              <p className="m-0 text-[11px] text-ink-muted">{year}년 {month + 1}월분 · 주방·캐셔 {kind === 'pdf' ? '장을 나눠' : '시트를 나눠'} 만듭니다</p>
            </div>
            <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink leading-none w-8 h-8">×</button>
          </div>

          <div className="px-4 py-3 border-b border-hairline flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => selectWhere(r => isDefaultReportTarget(r.pay))} className={chip}>{LABOR_REPORT_MIN_PAY / 10_000}만 원 초과만</button>
              <button onClick={() => selectWhere(() => true)} className={chip}>전체 선택</button>
              <button onClick={() => selectWhere(() => false)} className={chip}>전체 해제</button>
            </div>
            {kind === 'pdf' && (
              <>
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
              </>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0">
            {groups.map(g => {
              const on = g.rows.filter(r => selected.has(keyOf(r))).length
              return (
                <section key={g.role}>
                  <label className="sticky top-0 z-10 flex items-center gap-2.5 px-4 py-1.5 bg-canvas-soft border-b border-hairline cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on === g.rows.length}
                      ref={el => { if (el) el.indeterminate = on > 0 && on < g.rows.length }}
                      onChange={e => setMany(g.rows, e.target.checked)}
                      className="w-4 h-4 accent-primary-700 cursor-pointer"
                    />
                    <span className="text-[12px] font-bold text-ink">{REPORT_ROLE_LABEL[g.role]}</span>
                    <span className="text-[11px] text-ink-muted">{on}/{g.rows.length}명</span>
                  </label>
                  <ul className="m-0 p-0 list-none">
                    {g.rows.map(r => {
                      const checked = selected.has(keyOf(r))
                      const low = !isDefaultReportTarget(r.pay)
                      return (
                        <li key={keyOf(r)} className="border-b border-hairline">
                          <label className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-canvas-soft ${checked ? '' : 'opacity-60'}`}>
                            <input type="checkbox" checked={checked} onChange={e => setMany([r], e.target.checked)} className="w-4 h-4 accent-primary-700 cursor-pointer shrink-0" />
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
                </section>
              )
            })}
          </div>

          <div className="px-4 py-3 border-t border-hairline flex items-center gap-2">
            <span className="flex-1 text-[12px] text-ink-muted">
              {chosen.length}명{kind === 'pdf' ? ` · ${pdfPages}장` : ` · 시트 ${groupByRole(chosen).length + 1}개`}
            </span>
            <button
              onClick={download}
              disabled={downloading || chosen.length === 0}
              className="px-4 py-2 rounded-lg bg-primary-700 text-white text-[13px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? '만드는 중…' : kind === 'pdf' ? 'PDF 내려받기' : '엑셀 내려받기'}
            </button>
          </div>
        </div>

        {/* 오른쪽: 미리보기 */}
        <div className="flex-1 min-h-0 min-w-0 bg-canvas-soft">
          {chosen.length === 0
            ? <div className="flex items-center justify-center h-full text-ink-muted text-sm">왼쪽에서 넣을 사람을 골라주세요.</div>
            : kind === 'pdf'
              ? <PdfPreview document={previewDoc} title="근로내용 확인신고서 미리보기" />
              : <ExcelPreview rows={chosen} year={year} month={month} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** 엑셀 근로내용 시트를 화면에 미리 보여준다 — 실제 파일과 같은 칸(주방·캐셔 시트별) */
function ExcelPreview({ rows, year, month }: { rows: InsuranceReportRow[]; year: number; month: number }) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => i + 1)
  const eligible = rows.filter(r => r.pension.status === 'eligible').length
  return (
    <div className="h-full overflow-auto p-3 flex flex-col gap-4">
      {groupByRole(rows).map(g => (
        <div key={g.role} className="bg-canvas rounded-lg border border-hairline overflow-x-auto">
          <p className="m-0 px-3 py-2 text-[12px] font-bold text-ink border-b border-hairline">시트 · 근로내용({REPORT_ROLE_LABEL[g.role]}) <span className="font-normal text-ink-muted">{g.rows.length}명</span></p>
          <table className="border-collapse text-[11px] whitespace-nowrap">
            <thead>
              <tr className="bg-canvas-soft">
                <th className="px-2 py-1.5 text-left font-semibold text-ink-muted sticky left-0 bg-canvas-soft">성명</th>
                <th className="px-2 py-1.5 font-semibold text-ink-muted">주민등록번호</th>
                {days.map(d => {
                  const dow = new Date(year, month, d).getDay()
                  return <th key={d} className={`w-5 px-0.5 py-1.5 font-semibold ${dow === 0 || dow === 6 ? 'text-rose-500' : 'text-ink-muted'}`} title={DAY_NAMES[dow]}>{d}</th>
                })}
                <th className="px-2 py-1.5 font-semibold text-ink-muted">일수</th>
                <th className="px-2 py-1.5 font-semibold text-ink-muted">시간</th>
                <th className="px-2 py-1.5 font-semibold text-ink-muted text-right">보수총액</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map(r => {
                const worked = new Set(r.workDays)
                return (
                  <tr key={keyOf(r)} className="border-t border-hairline">
                    <td className="px-2 py-1.5 font-semibold text-ink sticky left-0 bg-canvas">{r.name}</td>
                    <td className={`px-2 py-1.5 tabular-nums ${r.residentId ? 'text-ink-secondary' : 'text-rose-600'}`}>{r.residentId ? formatResidentId(r.residentId) : '(미등록)'}</td>
                    {days.map(d => <td key={d} className="w-5 px-0.5 py-1.5 text-center text-primary-700">{worked.has(d) ? 'ㅇ' : ''}</td>)}
                    <td className="px-2 py-1.5 text-center tabular-nums">{r.days}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums">{r.hours}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.pay.toLocaleString('ko-KR')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      <p className="m-0 text-[11px] text-ink-muted">+ 시트 · 4대보험 가입대상 — 고른 사람 중 국민연금·건강보험 대상 {eligible}명</p>
    </div>
  )
}
