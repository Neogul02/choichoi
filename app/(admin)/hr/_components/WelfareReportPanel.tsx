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
  finalPay: number | null
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

export default function WelfareReportPanel({ staffId, name, phone, period, details, finalPay }: Props) {
  const [residentId, setResidentId] = useState<string | null>(null)
  const [residentLoading, setResidentLoading] = useState(true)
  const [residentManual, setResidentManual] = useState('')

  const [nationality, setNationality] = useState('')
  const [visaStatus, setVisaStatus] = useState('')
  const [jobCode, setJobCode] = useState('')
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

  const totalRawHours = details ? minutesToHours(details.reduce((s, d) => s + d.rawMinutes, 0)) : 0
  const workDaysCount = workedDays.size

  const [avgDailyHours, setAvgDailyHours] = useState('')
  const [paymentBaseDays, setPaymentBaseDays] = useState('')
  const [totalPayInput, setTotalPayInput] = useState('')
  const [wageTotalInput, setWageTotalInput] = useState('')
  // 근무 데이터가 로드되면 계산값으로 채워 넣는다 — 이후엔 직접 수정 가능
  useEffect(() => { setAvgDailyHours(totalRawHours > 0 ? String(totalRawHours) : '') }, [totalRawHours])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPaymentBaseDays(workDaysCount > 0 ? String(workDaysCount) : '') }, [autoWorkedDays])
  useEffect(() => { setTotalPayInput(finalPay != null ? String(finalPay) : '') }, [finalPay])
  useEffect(() => { setWageTotalInput(finalPay != null ? String(finalPay) : '') }, [finalPay])

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
      `국적: ${nationality}`,
      `체류자격: ${visaStatus}`,
      `전화번호(휴대전화): ${phone ? formatPhoneNumber(phone) : ''}`,
      `직종 부호: ${jobCode}`,
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

  const inputCls = 'w-full px-2 py-1.5 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700'
  const labelCls = 'text-[10px] font-semibold text-ink-muted'

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-hairline bg-canvas-soft flex items-center justify-between gap-2">
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

      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>성명</label>
            <div className="mt-1 px-2 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] font-semibold text-ink">
              <CopyText value={name} label="성명">{name}</CopyText>
            </div>
          </div>
          <div>
            <label className={labelCls}>전화번호(휴대전화)</label>
            <div className="mt-1 px-2 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] font-semibold text-ink">
              {phone ? <CopyText value={formatPhoneNumber(phone)} label="전화번호">{formatPhoneNumber(phone)}</CopyText> : <span className="text-ink-faint font-normal">미등록</span>}
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>주민등록번호(외국인등록번호)</label>
          {residentLoading ? (
            <div className="mt-1 px-2 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] text-ink-faint">불러오는 중...</div>
          ) : residentId ? (
            <div className="mt-1 px-2 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] font-semibold text-ink tracking-wide">
              <CopyText value={formatResidentId(residentId)} label="주민등록번호">{formatResidentId(residentId)}</CopyText>
            </div>
          ) : (
            <input
              type="text" value={residentManual} onChange={e => setResidentManual(e.target.value)}
              placeholder="등록된 번호 없음 — 외국인등록번호 등 직접 입력"
              className={`mt-1 ${inputCls}`}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>국적</label>
            <input type="text" value={nationality} onChange={e => setNationality(e.target.value)} className={`mt-1 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>체류자격</label>
            <input type="text" value={visaStatus} onChange={e => setVisaStatus(e.target.value)} className={`mt-1 ${inputCls}`} />
          </div>
        </div>

        <div>
          <label className={labelCls}>직종 부호</label>
          <input type="text" value={jobCode} onChange={e => setJobCode(e.target.value)} className={`mt-1 ${inputCls} max-w-[140px]`} />
        </div>

        {/* 근로일수 그리드 — 실제 근무일에서 자동 표시, 클릭해서 정정 가능 */}
        <div>
          <label className={labelCls}>근로일수 (&quot;o&quot;표시 — 클릭해서 정정)</label>
          <div className="mt-1 rounded-lg border border-hairline overflow-hidden">
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
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>근로일수</label>
            <div className="mt-1 px-2 py-1.5 rounded-lg border border-hairline bg-canvas-soft text-[12px] font-semibold text-ink">{workDaysCount}일</div>
          </div>
          <div>
            <label className={labelCls}>일평균 근로시간</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" value={avgDailyHours} onChange={e => setAvgDailyHours(e.target.value)} className={inputCls} />
              <span className="text-[11px] text-ink-muted shrink-0">시간</span>
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>보수지급기초일수</label>
          <div className="mt-1 flex items-center gap-1 max-w-[140px]">
            <input type="number" value={paymentBaseDays} onChange={e => setPaymentBaseDays(e.target.value)} className={inputCls} />
            <span className="text-[11px] text-ink-muted shrink-0">일</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>보수총액</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" value={totalPayInput} onChange={e => setTotalPayInput(e.target.value)} className={inputCls} />
              <span className="text-[11px] text-ink-muted shrink-0">원</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>임금총액</label>
            <div className="mt-1 flex items-center gap-1">
              <input type="number" value={wageTotalInput} onChange={e => setWageTotalInput(e.target.value)} className={inputCls} />
              <span className="text-[11px] text-ink-muted shrink-0">원</span>
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>이직사유 코드</label>
          <input type="text" value={leaveReasonCode} onChange={e => setLeaveReasonCode(e.target.value)} className={`mt-1 ${inputCls} max-w-[100px]`} />
        </div>
      </div>
    </div>
  )
}
