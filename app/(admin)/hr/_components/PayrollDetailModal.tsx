'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchStaffMonthlyDetail, type StaffDayDetail } from '@/app/actions/payroll'

interface Adjustment {
  id: number
  label: string
  amount: number
}

interface Props {
  staffId: number
  name: string
  phone?: string | null
  hourlyRate: number | null
  basePay: number | null
  totalHours: number
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
  staffId, name, hourlyRate, basePay, totalHours, year, month, onClose,
}: Props) {
  const [details, setDetails] = useState<StaffDayDetail[] | null>(null)
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchStaffMonthlyDetail(staffId, year, month).then(res => {
      setDetails(res.success && res.data ? res.data : [])
    })
  }, [staffId, year, month])

  const adjustTotal = adjustments.reduce((s, a) => s + a.amount, 0)
  const finalPay = basePay != null ? basePay + adjustTotal : null

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
    if (details && details.length > 0) {
      lines.push('', '[ 근무 상세 ]')
      for (const d of details) {
        lines.push(`${d.date} ${d.shiftName} ${d.startTime}~${d.endTime} (${d.hours}h)`)
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
      <div className="bg-canvas w-full max-w-[520px] max-h-[90vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline [scrollbar-width:thin]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-canvas-soft sticky top-0 z-10">
          <div>
            <h3 className="m-0 text-[16px] font-bold text-ink">{name}</h3>
            <p className="m-0 text-[12px] text-ink-muted">{year}년 {month + 1}월 급여 세부내역</p>
          </div>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
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
                      <th className="text-right px-3 py-2 font-semibold text-ink-muted">시간수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d, i) => (
                      <tr key={i} className={i !== details.length - 1 ? 'border-b border-hairline' : ''}>
                        <td className="px-3 py-2 font-semibold text-ink">{formatDate(d.date)}</td>
                        <td className="px-2 py-2 text-ink-muted">{d.shiftName}</td>
                        <td className="px-2 py-2 text-center text-ink-muted">{d.startTime}~{d.endTime}</td>
                        <td className="px-3 py-2 text-right font-semibold text-ink">{d.hours}h</td>
                      </tr>
                    ))}
                    <tr className="border-t border-hairline bg-canvas-soft">
                      <td colSpan={3} className="px-3 py-2 text-[11px] font-semibold text-ink-muted">합계</td>
                      <td className="px-3 py-2 text-right font-bold text-ink">{totalHours}h</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
                  {basePay != null ? `${basePay.toLocaleString('ko-KR')}원` : <span className="text-ink-faint font-normal text-[11px]">시급 미설정</span>}
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

          {/* 공유 버튼 */}
          <button
            onClick={handleShare}
            className="w-full py-3 rounded-xl border-none bg-amber-500 text-white text-[13px] font-bold cursor-pointer hover:bg-amber-600 active:bg-amber-700 transition"
          >
            {copied ? '✓ 클립보드에 복사됨!' : '📋 급여 내역 복사 (카카오 / 문자 공유)'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
