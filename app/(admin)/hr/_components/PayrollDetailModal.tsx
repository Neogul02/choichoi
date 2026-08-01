'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchStaffMonthlyDetail, type StaffDayDetail } from '@/app/actions/payroll'
import { getWorkerContracts } from '@/app/actions/contracts'
import type { ContractRecord } from '@/app/actions/contracts'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useModalKeyboard } from '@/lib/useModalKeyboard'
import { minutesToHours } from '@/lib/workhours'

const PDFPreviewPanel = dynamic(() => import('@/components/PDFPreviewPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-ink-muted text-sm">계약서 로딩 중...</div>
  ),
})

interface Adjustment {
  id: number
  label: string
  amount: number
}

interface Props {
  staffId: number
  name: string
  phone?: string | null
  bankName?: string | null
  bankAccount?: string | null
  hourlyRate: number | null
  year: number
  month: number
  onClose: () => void
}

let nextAdjId = 1

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${dateStr.slice(5)} (${DAY_KO[d.getDay()]})`
}

export default function PayrollDetailModal({
  staffId, name, phone, bankName, bankAccount, hourlyRate, year, month, onClose,
}: Props) {
  useBodyScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)
  useModalKeyboard({ active: true, onClose, containerRef: panelRef })
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    })
  }
  const [details, setDetails] = useState<StaffDayDetail[] | null>(null)
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [copied, setCopied] = useState(false)
  // 최근 계약서 — 서명 이미지를 포함한 실제 저장 데이터를 그대로 미리보기에 사용 (직원 정보로 새로 조립하지 않음)
  const [latestContract, setLatestContract] = useState<ContractRecord | null>(null)
  const [contractsLoaded, setContractsLoaded] = useState(false)

  useEffect(() => {
    fetchStaffMonthlyDetail(staffId, year, month).then(res => {
      setDetails(res.success && res.data ? res.data : [])
    })
    setContractsLoaded(false)
    getWorkerContracts(staffId).then(res => {
      setLatestContract(res.success && res.data && res.data.length > 0 ? res.data[0] : null)
      setContractsLoaded(true)
    })
  }, [staffId, year, month])

  // 총 유급시간·기본급은 이 모달이 직접 불러온 details(일별 상세)에서만 계산한다.
  // 목록(PayrollPanel)의 totalHours/totalPay는 react-query 캐시(staleTime 5분)를 타므로
  // 스케줄 화면에서 방금 휴게시간·시간을 수정한 직후엔 값이 어긋날 수 있어, prop으로 받지 않는다.
  const minToH = minutesToHours
  const rawSum = details?.reduce((s, d) => s + d.rawMinutes, 0) ?? 0
  const breakSum = details?.reduce((s, d) => s + d.breakMinutes, 0) ?? 0
  const totalHours = details ? minutesToHours(details.reduce((s, d) => s + d.paidMinutes, 0)) : 0
  const basePay = details != null && hourlyRate != null ? Math.round(totalHours * hourlyRate) : null

  const adjustTotal = adjustments.reduce((s, a) => s + a.amount, 0)
  const finalPay = basePay != null ? basePay + adjustTotal : null

  const formulaLines: string[] = []
  if (details && details.length > 0) {
    formulaLines.push(`실근무 ${minToH(rawSum)}h − 휴게 ${minToH(breakSum)}h = 유급 ${totalHours}h`)
    if (hourlyRate != null && basePay != null) {
      formulaLines.push(`기본급 = ${totalHours}h × ${hourlyRate.toLocaleString('ko-KR')}원 = ${basePay.toLocaleString('ko-KR')}원`)
    }
    for (const a of adjustments) {
      formulaLines.push(`${a.amount >= 0 ? '+' : '−'} ${a.label} ${Math.abs(a.amount).toLocaleString('ko-KR')}원`)
    }
    if (finalPay != null && (adjustments.length > 0 || basePay != null)) {
      formulaLines.push(`최종 지급액 = ${finalPay.toLocaleString('ko-KR')}원`)
    }
  }
  const formulaText = formulaLines.join('\n')

  const addAdjustment = () => {
    const amount = Number(newAmount)
    if (!newLabel.trim() || isNaN(amount) || !newAmount.trim()) return
    setAdjustments(p => [...p, { id: nextAdjId++, label: newLabel.trim(), amount }])
    setNewLabel('')
    setNewAmount('')
  }

  const handleShare = () => {
    const monthStr = `${year}년 ${month + 1}월`
    const lines: string[] = [
      `📋 ${name} 님 ${monthStr} 급여 내역`,
      '',
      `총 근무: ${details?.length ?? 0}일 / ${totalHours}h`,
    ]
    if (hourlyRate != null) lines.push(`시급: ${hourlyRate.toLocaleString('ko-KR')}원`)
    if (basePay != null) lines.push(`기본급: ${basePay.toLocaleString('ko-KR')}원`)
    if (adjustments.length > 0) {
      lines.push('', '[ 조정 내역 ]')
      for (const a of adjustments) {
        lines.push(`${a.label}: ${a.amount >= 0 ? '+' : ''}${a.amount.toLocaleString('ko-KR')}원`)
      }
    }
    if (finalPay != null) lines.push('', `✅ 최종 지급액: ${finalPay.toLocaleString('ko-KR')}원`)
    if (formulaLines.length > 0) {
      lines.push('', '[ 계산식 ]', ...formulaLines, '※ 휴게시간은 근무 1건당 기본 1시간 (근무일별 개별 조정 가능)')
    }
    if (details && details.length > 0) {
      lines.push('', '[ 근무 상세 ]')
      for (const d of details) {
        const extras = [
          d.breakMinutes > 0 ? `휴게 ${minToH(d.breakMinutes)}h 차감${d.isCustomBreak ? '(개별)' : ''}` : d.isCustomBreak ? '휴게 미포함(개별)' : '',
          d.isCustomTime ? '시간 개별 수정' : '',
        ].filter(Boolean)
        lines.push(`${d.date} ${d.shiftName} ${d.startTime}~${d.endTime} = ${d.hours}h${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`)
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

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
        className="bg-canvas w-full rounded-xl shadow-level-2 border border-hairline flex flex-col md:flex-row overflow-hidden max-w-[960px]"
        style={{ maxHeight: '90vh' }}
      >
        {/* 좌측: 급여 세부내역 */}
        <div className="flex flex-col overflow-y-auto [scrollbar-width:thin] flex-1 min-w-0 md:max-w-[520px]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-canvas-soft sticky top-0 z-10">
          <div>
            <h3 className="m-0 text-[16px] font-bold text-ink">{name}</h3>
            <p className="m-0 text-[12px] text-ink-muted">{year}년 {month + 1}월 급여 세부내역</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* 연락처 / 계좌 */}
          {(phone || bankAccount) && (
            <div className="flex flex-wrap gap-2">
              {phone && (
                <button
                  onClick={() => copyText('phone', phone)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft hover:bg-[#ececeb] transition text-[12px] text-ink cursor-pointer"
                >
                  <span className="text-ink-muted text-[10px] font-semibold">전화</span>
                  <span className="font-semibold">{phone}</span>
                  <span className="text-[10px] text-primary-600">{copiedKey === 'phone' ? '복사됨!' : '복사'}</span>
                </button>
              )}
              {bankName && bankAccount && (
                <button
                  onClick={() => copyText('bank', bankAccount)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft hover:bg-[#ececeb] transition text-[12px] text-ink cursor-pointer"
                >
                  <span className="text-ink-muted text-[10px] font-semibold">{bankName}</span>
                  <span className="font-semibold">{bankAccount}</span>
                  <span className="text-[10px] text-primary-600">{copiedKey === 'bank' ? '복사됨!' : '복사'}</span>
                </button>
              )}
              {!bankName && bankAccount && (
                <button
                  onClick={() => copyText('bank', bankAccount)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft hover:bg-[#ececeb] transition text-[12px] text-ink cursor-pointer"
                >
                  <span className="text-ink-muted text-[10px] font-semibold">계좌</span>
                  <span className="font-semibold">{bankAccount}</span>
                  <span className="text-[10px] text-primary-600">{copiedKey === 'bank' ? '복사됨!' : '복사'}</span>
                </button>
              )}
            </div>
          )}

          {/* 근무 상세 테이블 */}
          <div>
            <h4 className="m-0 mb-2 text-[11px] font-bold text-ink-muted uppercase tracking-wide">근무 상세</h4>
            {details === null ? (
              <p className="text-[12px] text-ink-faint m-0">불러오는 중...</p>
            ) : details.length === 0 ? (
              <p className="text-[12px] text-ink-faint m-0">이번 달 근무 기록이 없습니다.</p>
            ) : (
              <div className="rounded-lg border border-hairline overflow-hidden">
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-canvas-soft border-b border-hairline">
                      <th className="text-left px-3 py-2 font-semibold text-ink-muted">날짜</th>
                      <th className="text-left px-2 py-2 font-semibold text-ink-muted">파트</th>
                      <th className="text-center px-2 py-2 font-semibold text-ink-muted">시간</th>
                      <th className="text-center px-2 py-2 font-semibold text-ink-muted">휴게</th>
                      <th className="text-right px-3 py-2 font-semibold text-ink-muted">유급</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d, i) => (
                      <tr key={i} className={i !== details.length - 1 ? 'border-b border-hairline' : ''}>
                        <td className="px-3 py-2 font-semibold text-ink whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="px-2 py-2 text-ink-muted">{d.shiftName}</td>
                        <td className={`px-2 py-2 text-center whitespace-nowrap ${d.isCustomTime ? 'text-primary-700 font-semibold' : 'text-ink-muted'}`} title={d.isCustomTime ? '파트 기본 시간이 아닌 개별 수정 시간' : undefined}>
                          {d.startTime}~{d.endTime}{d.isCustomTime && <span className="ml-0.5 align-super text-[9px]">*</span>}
                        </td>
                        <td className={`px-2 py-2 text-center ${d.isCustomBreak ? 'text-primary-700 font-semibold' : 'text-ink-faint'}`} title={d.isCustomBreak ? '기본 휴게시간이 아닌 이 근무일만 개별 조정된 값' : undefined}>
                          {d.breakMinutes > 0 ? `−${minToH(d.breakMinutes)}h` : '없음'}{d.isCustomBreak && <span className="ml-0.5 align-super text-[9px]">*</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-ink">{d.hours}h</td>
                      </tr>
                    ))}
                    <tr className="border-t border-hairline bg-canvas-soft">
                      <td colSpan={2} className="px-3 py-2 text-[11px] font-semibold text-ink-muted">합계</td>
                      <td className="px-2 py-2 text-center text-[11px] text-ink-muted">실근무 {minToH(rawSum)}h</td>
                      <td className="px-2 py-2 text-center text-[11px] text-ink-muted">−{minToH(breakSum)}h</td>
                      <td className="px-3 py-2 text-right font-bold text-ink">{totalHours}h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {details && details.some(d => d.isCustomTime || d.isCustomBreak) && (
              <p className="m-0 mt-1.5 text-[10px] text-ink-faint"><span className="text-primary-700 font-semibold">*</span> 기본값이 아닌 이 근무일만 개별 조정된 시간/휴게시간</p>
            )}
          </div>

          {/* 급여 계산 */}
          <div>
            <h4 className="m-0 mb-2 text-[11px] font-bold text-ink-muted uppercase tracking-wide">급여 계산</h4>
            <div className="rounded-lg border border-hairline overflow-hidden">
              {/* 기본급 */}
              <div className="flex justify-between items-center px-3 py-2.5 border-b border-hairline">
                <span className="text-[12px] text-ink-muted">
                  기본급
                  {hourlyRate != null && <span className="ml-1 text-ink-faint">({totalHours}h × {hourlyRate.toLocaleString('ko-KR')}원)</span>}
                </span>
                <span className="text-[13px] font-bold text-ink">
                  {details == null
                    ? <span className="text-ink-faint font-normal text-[11px]">불러오는 중...</span>
                    : basePay != null ? `${basePay.toLocaleString('ko-KR')}원` : <span className="text-ink-faint font-normal text-[11px]">시급 미설정</span>}
                </span>
              </div>

              {/* 조정 항목 목록 */}
              {adjustments.map(a => (
                <div key={a.id} className="flex justify-between items-center px-3 py-2 border-b border-hairline group">
                  <span className="text-[12px] text-ink">{a.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-semibold ${a.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {a.amount >= 0 ? '+' : ''}{a.amount.toLocaleString('ko-KR')}원
                    </span>
                    <button
                      onClick={() => setAdjustments(p => p.filter(x => x.id !== a.id))}
                      className="text-ink-faint text-[16px] bg-transparent border-none cursor-pointer hover:text-rose-500 transition opacity-0 group-hover:opacity-100 leading-none"
                    >×</button>
                  </div>
                </div>
              ))}

              {/* 조정 항목 추가 */}
              <div className="flex gap-1.5 px-3 py-2 border-b border-hairline bg-canvas-soft">
                <input
                  type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  placeholder="항목명 (식대, 교통비, 공제...)"
                  className="flex-1 px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700 min-w-0"
                  onKeyDown={e => e.key === 'Enter' && addAdjustment()}
                />
                <input
                  type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                  placeholder="금액 (+/-)"
                  className="w-[88px] px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700"
                  onKeyDown={e => e.key === 'Enter' && addAdjustment()}
                />
                <button
                  onClick={addAdjustment}
                  className="px-2.5 py-1.5 rounded-lg bg-primary-700 text-white text-[11px] font-bold border-none cursor-pointer hover:bg-primary-800 transition whitespace-nowrap"
                >
                  + 추가
                </button>
              </div>

              {/* 최종 합계 */}
              <div className="flex justify-between items-center px-3 py-3 bg-canvas-soft">
                <div>
                  <span className="text-[13px] font-bold text-ink">최종 지급액</span>
                  {adjustments.length > 0 && adjustTotal !== 0 && (
                    <span className={`ml-2 text-[11px] font-semibold ${adjustTotal >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      ({adjustTotal >= 0 ? '+' : ''}{adjustTotal.toLocaleString('ko-KR')}원 조정)
                    </span>
                  )}
                </div>
                <span className="text-[18px] font-extrabold text-primary-700">
                  {finalPay != null ? `${finalPay.toLocaleString('ko-KR')}원` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* 계산식 */}
          {formulaLines.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="m-0 text-[11px] font-bold text-ink-muted uppercase tracking-wide">계산식</h4>
                <button
                  onClick={() => copyText('formula', formulaText)}
                  className="px-2 py-0.5 rounded-md border border-hairline bg-canvas-soft text-[10px] font-semibold text-ink-muted cursor-pointer hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition"
                >
                  {copiedKey === 'formula' ? '복사됨!' : '계산식 복사'}
                </button>
              </div>
              <div className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2.5 font-mono text-[11px] text-ink leading-relaxed whitespace-pre-wrap break-words">
                {formulaText}
              </div>
              <p className="m-0 mt-1.5 text-[10px] text-ink-faint">※ 휴게시간은 근무 1건당 기본 1시간(근무일별로 스케줄 화면에서 개별 조정 가능) · 유급시간은 0.1h 단위 반올림</p>
            </div>
          )}

          {/* 공유 버튼 */}
          <button
            onClick={handleShare}
            className="w-full py-3 rounded-xl border-none bg-amber-500 text-white text-[13px] font-bold cursor-pointer hover:bg-amber-600 active:bg-amber-700 transition"
          >
            {copied ? '✓ 클립보드에 복사됨!' : '📋 급여 내역 복사 (카카오 / 문자 공유)'}
          </button>
        </div>
        </div>{/* 좌측 컬럼 끝 */}

        {/* 우측: 근로계약서 — 실제 저장된 계약서(서명 포함)를 그대로 보여준다 */}
        <div className="border-t md:border-t-0 md:border-l border-hairline flex flex-col w-full md:w-[420px] md:min-w-[420px] min-h-[420px] md:min-h-0">
          <div className="px-4 py-4 border-b border-hairline bg-canvas-soft flex items-center justify-between gap-2">
            <div>
              <p className="m-0 text-[13px] font-bold text-ink">근로계약서</p>
              <p className="m-0 text-[11px] text-ink-muted mt-0.5">{name} · 최근 계약</p>
            </div>
            {latestContract && (
              latestContract.worker_signed_at ? (
                <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">서명완료</span>
              ) : (
                <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">서명대기</span>
              )
            )}
          </div>
          <div className="flex-1 min-h-0">
            {!contractsLoaded ? (
              <div className="flex items-center justify-center h-full text-ink-muted text-sm">계약서 로딩 중...</div>
            ) : !latestContract ? (
              <div className="flex items-center justify-center h-full text-ink-faint text-sm">작성된 근로계약서가 없습니다.</div>
            ) : latestContract.contract_data ? (
              <PDFPreviewPanel contractData={latestContract.contract_data} />
            ) : latestContract.pdf_signed_url ? (
              <iframe src={latestContract.pdf_signed_url} className="w-full h-full border-none" title="근로계약서" />
            ) : (
              <div className="flex items-center justify-center h-full text-ink-faint text-sm">미리보기를 불러올 수 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
