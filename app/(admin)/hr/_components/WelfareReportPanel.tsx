'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchWelfareReportResidentId, type StaffDayDetail } from '@/app/actions/payroll'
import type { PayrollPeriod } from './PayrollDetailModal'
import CopyText, { copyToClipboard } from '@/components/CopyText'
import { showMsg } from '@/lib/toast'
import { formatPhoneNumber } from '@/lib/utils'
import { minutesToHours } from '@/lib/workhours'

interface Props {
  staffId: number
  name: string
  phone?: string | null
  period: PayrollPeriod
  details: StaffDayDetail[] | null
  grossPay: number | null
  /** 기본급(시간×시급) — 보수총액이 어떻게 나왔는지 풀어서 보여준다 */
  basePay?: number | null
  /** 조정 항목 — 수당(+)만 보수총액에 더한다. 공제(−)는 세전 신고라 빼지 않는다 */
  adjustments?: { label: string; amount: number }[]
}

function formatResidentId(raw: string) {
  return raw.length === 13 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw
}

// 화면에 보이는 순서 그대로 5칸씩 끊어 1~31 그리드를 만든다(근로복지공단 서식과 동일한 배치)
function chunkDays() {
  const rows: number[][] = []
  for (let i = 1; i <= 31; i += 5) rows.push(Array.from({ length: Math.min(5, 32 - i) }, (_, j) => i + j))
  return rows
}
const DAY_ROWS = chunkDays()

export default function WelfareReportPanel({ staffId, name, phone, period, details, grossPay, basePay = null, adjustments = [] }: Props) {
  const [residentId, setResidentId] = useState<string | null>(null)
  const [residentLoading, setResidentLoading] = useState(true)
  const [residentManual, setResidentManual] = useState('')

  const [leaveReasonCode, setLeaveReasonCode] = useState('')

  const daysInMonth = period.type === 'month' ? new Date(period.year, period.month + 1, 0).getDate() : 31

  // 실제 근무일(details)에서 자동으로 뽑아낸 근무일자 — "o" 표시 초기값. 정정이 필요하면 직접 클릭해서 토글
  const autoWorkedDays = useMemo(() => {
    const set = new Set<number>()
    for (const d of details ?? []) set.add(Number(d.date.slice(8, 10)))
    return set
  }, [details])
  const [workedDays, setWorkedDays] = useState<Set<number>>(new Set())
  useEffect(() => setWorkedDays(new Set(autoWorkedDays)), [autoWorkedDays])

  const toggleDay = (day: number) => {
    setWorkedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const totalPaidHours = details ? minutesToHours(details.reduce((s, d) => s + d.paidMinutes, 0)) : 0
  const workDaysCount = workedDays.size
  // 일평균 근로시간 = 유급(휴게 뺀) 시간 ÷ 근무일 — 예전엔 합계 시간이 그대로 들어가 있었다
  const detailDays = details?.length ?? 0
  const avgPaid = detailDays > 0 ? Math.round((totalPaidHours / detailDays) * 10) / 10 : 0
  const allowances = adjustments.filter(a => a.amount > 0)
  const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0)

  const [avgDailyHours, setAvgDailyHours] = useState('')
  const [paymentBaseDays, setPaymentBaseDays] = useState('')
  const [totalPayInput, setTotalPayInput] = useState('')
  const [wageTotalInput, setWageTotalInput] = useState('')
  // 근무 데이터가 로드되면 계산값으로 채워 넣는다 — 이후엔 직접 수정 가능
  useEffect(() => { setAvgDailyHours(avgPaid > 0 ? String(avgPaid) : '') }, [avgPaid])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPaymentBaseDays(workDaysCount > 0 ? String(workDaysCount) : '') }, [autoWorkedDays])
  useEffect(() => { setTotalPayInput(grossPay != null ? String(grossPay) : '') }, [grossPay])
  useEffect(() => { setWageTotalInput(grossPay != null ? String(grossPay) : '') }, [grossPay])

  useEffect(() => {
    setResidentLoading(true)
    setResidentId(null)
    fetchWelfareReportResidentId(staffId).then(res => {
      setResidentId(res.success && res.data ? res.data.residentId : null)
      setResidentLoading(false)
    })
  }, [staffId])

  const residentDisplay = residentId ? formatResidentId(residentId) : residentManual

  const handleCopy = async () => {
    const lines = [
      '[근로복지공단 단기간근로자 고용신고]',
      `성명: ${name}`,
      `주민등록번호(외국인등록번호): ${residentDisplay}`,
      `전화번호(휴대전화): ${phone ? formatPhoneNumber(phone) : ''}`,
      `근로일수("o"표시): ${[...workedDays].sort((a, b) => a - b).join(', ')}`,
      `근로일수: ${workDaysCount}일`,
      `일평균 근로시간: ${avgDailyHours}시간`,
      `보수지급기초일수: ${paymentBaseDays}일`,
      `보수총액: ${totalPayInput ? Number(totalPayInput).toLocaleString('ko-KR') : ''}원`,
      `임금총액: ${wageTotalInput ? Number(wageTotalInput).toLocaleString('ko-KR') : ''}원`,
      `이직사유 코드: ${leaveReasonCode}`,
    ]
    if (await copyToClipboard(lines.join('\n'))) showMsg('신고서 내용 복사됨')
    else showMsg('복사에 실패했습니다.')
  }

  const th = 'bg-canvas-soft text-ink-muted font-semibold text-[11px] text-left align-top px-2.5 py-2.5 border border-hairline'
  const td = 'border border-hairline px-2.5 py-2 align-top text-[13px] text-ink'
  const cellInputCls = 'w-full min-w-0 bg-transparent border-none outline-none text-[13px] text-ink focus:bg-primary-50 rounded px-1 py-0.5'
  const hint = 'm-0 mt-1 text-[11px] text-ink-faint leading-snug'
  const wonFmt = (v: string) => (v ? Number(v).toLocaleString('ko-KR') : '')
  const wonParse = (raw: string) => raw.replace(/[^0-9]/g, '')
  const grossBreakdown = basePay != null
    ? `기본급 ${basePay.toLocaleString('ko-KR')}원${allowances.map(a => ` + ${a.label} ${a.amount.toLocaleString('ko-KR')}원`).join('')} = ${(basePay + allowanceTotal).toLocaleString('ko-KR')}원`
    : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 md:pr-16 border-b border-hairline bg-canvas-soft flex items-center justify-between gap-2">
        <div>
          <p className="m-0 text-[13px] font-bold text-ink">근로복지공단 단기간근로자 고용신고</p>
          <p className="m-0 text-[11px] text-ink-muted mt-0.5">{name} · 신고서 작성용</p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary-700 text-white text-[11px] font-bold border-none cursor-pointer hover:bg-primary-800 transition"
        >
          내용 복사
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] p-4">
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col className="w-[34%]" />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <th className={th}>성명</th>
              <td className={td}>
                <CopyText value={name} label="성명">{name}</CopyText>
              </td>
            </tr>
            <tr>
              <th className={th}>전화번호(휴대전화)</th>
              <td className={td}>
                {phone ? <CopyText value={formatPhoneNumber(phone)} label="전화번호">{formatPhoneNumber(phone)}</CopyText> : <span className="text-ink-faint">미등록</span>}
              </td>
            </tr>
            <tr>
              <th className={th}>주민등록번호<br />(외국인등록번호)</th>
              <td className={td}>
                {residentLoading ? (
                  <span className="text-ink-faint">불러오는 중…</span>
                ) : residentId ? (
                  <span className="font-semibold tracking-wide">
                    <CopyText value={formatResidentId(residentId)} label="주민등록번호">{formatResidentId(residentId)}</CopyText>
                  </span>
                ) : (
                  <input
                    type="text" value={residentManual} onChange={e => setResidentManual(e.target.value)}
                    placeholder="등록된 번호 없음 — 외국인등록번호 등 직접 입력"
                    className={cellInputCls}
                  />
                )}
              </td>
            </tr>
            <tr>
              <th className={th}>근로일수<br />(&quot;o&quot;표시 — 클릭해서 정정)</th>
              <td className="border border-hairline p-0">
                {DAY_ROWS.map((row, i) => (
                  <div key={i} className={`grid grid-cols-5 ${i !== DAY_ROWS.length - 1 ? 'border-b border-hairline' : ''}`}>
                    {row.map(day => {
                      const disabled = day > daysInMonth
                      const marked = workedDays.has(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleDay(day)}
                          className={`flex flex-col items-center justify-center py-1.5 border-r border-hairline last:border-r-0 text-[10px] cursor-pointer transition ${
                            disabled ? 'bg-canvas-soft text-ink-faint cursor-not-allowed' :
                            marked ? 'bg-primary-50 text-primary-700 font-bold' : 'bg-canvas text-ink-faint hover:bg-canvas-soft'
                          }`}
                        >
                          <span>{day}</span>
                          <span className="h-3">{marked && !disabled ? 'o' : ''}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <th className={th}>근로일수</th>
              <td className={td}>
                <strong className="tabular-nums">{workDaysCount}일</strong>
                {workDaysCount !== detailDays && <p className={hint}>근무 기록은 {detailDays}일 — 위 칸에서 직접 고친 값이에요</p>}
              </td>
            </tr>
            <tr>
              <th className={th}>일평균 근로시간</th>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <input type="text" inputMode="decimal" value={avgDailyHours} onChange={e => setAvgDailyHours(e.target.value)} className={`${cellInputCls} tabular-nums`} />
                  <span className="text-ink-muted shrink-0">시간</span>
                </div>
                {detailDays > 0 && <p className={hint}>유급 {totalPaidHours}h ÷ {detailDays}일 = {avgPaid}h (휴게 제외)</p>}
              </td>
            </tr>
            <tr>
              <th className={th}>보수지급기초일수</th>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <input type="text" inputMode="numeric" value={paymentBaseDays} onChange={e => setPaymentBaseDays(e.target.value.replace(/[^0-9]/g, ''))} className={`${cellInputCls} tabular-nums`} />
                  <span className="text-ink-muted shrink-0">일</span>
                </div>
                <p className={hint}>보통 근로일수와 같아요</p>
              </td>
            </tr>
            <tr>
              <th className={th}>보수총액</th>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <input type="text" inputMode="numeric" value={wonFmt(totalPayInput)} onChange={e => setTotalPayInput(wonParse(e.target.value))} className={`${cellInputCls} font-semibold tabular-nums`} />
                  <span className="text-ink-muted shrink-0">원</span>
                </div>
                {grossBreakdown && <p className={hint}>{grossBreakdown} · 세전(보험료·원천징수 빼기 전)</p>}
              </td>
            </tr>
            <tr>
              <th className={th}>임금총액</th>
              <td className={td}>
                <div className="flex items-center gap-1">
                  <input type="text" inputMode="numeric" value={wonFmt(wageTotalInput)} onChange={e => setWageTotalInput(wonParse(e.target.value))} className={`${cellInputCls} font-semibold tabular-nums`} />
                  <span className="text-ink-muted shrink-0">원</span>
                </div>
                <p className={hint}>비과세 포함 전체 임금. 식대 같은 비과세 수당이 있으면 보수총액은 그만큼 빼서 적어요</p>
              </td>
            </tr>
            <tr>
              <th className={th}>이직사유 코드</th>
              <td className={td}>
                <input type="text" value={leaveReasonCode} onChange={e => setLeaveReasonCode(e.target.value)} placeholder="퇴사자만" className={cellInputCls} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
