'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchStaffMonthlyDetail, fetchStaffPopupDetail, addPayrollAdjustment, removePayrollAdjustment,
  fetchAdjustmentPresets, removeAdjustmentPreset, setStaffDefaultDeduction,
  type StaffDayDetail, type PayrollAdjustment, type PensionRow,
} from '@/app/actions/payroll'
import type { MissingClockIn } from '@/app/actions/attendance'
import WelfareReportPanel from './WelfareReportPanel'
import CopyText from '@/components/CopyText'
import { showMsg } from '@/lib/toast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { useModalKeyboard } from '@/lib/useModalKeyboard'
import { formatPhoneNumber } from '@/lib/utils'
import { minutesToHours, formatTimeRange } from '@/lib/workhours'
import { DAY_NAMES as DAY_KO } from '@/lib/staffing'
import {
  DEFAULT_DEDUCTIONS, EMPLOYMENT_INSURANCE_LABEL, HEALTH_LABEL, LONG_TERM_CARE_LABEL, PENSION_LABEL, SOCIAL_INSURANCE_LABELS, WITHHOLDING_LABEL,
  deductionKind, isSameDeduction, isDefaultDeduction, percentDeduction, quickDeductionAmount,
  type DefaultDeduction,
} from '@/lib/payroll-deductions'

// 월별 정산(달력 기준) 또는 팝업별 정산(행사 기간 기준, 월 경계를 넘어가도 한 번에) 중 하나로 조회
export type PayrollPeriod =
  | { type: 'month'; year: number; month: number }
  | { type: 'popup'; popupId: number; popupName: string; startDate: string; endDate: string }

interface Props {
  staffId: number
  /** 정산 구간 키 — 조정 항목을 이 구간에 묶어 DB에 저장한다 */
  periodKey: string
  /** 부모(PayrollPanel)가 들고 있는 이 직원의 저장된 조정 항목 */
  initialAdjustments: PayrollAdjustment[]
  /** 조정 항목이 바뀌면 목록의 지급액도 다시 계산되도록 부모에 알린다 */
  onAdjustmentsChanged: () => void
  name: string
  phone?: string | null
  bankName?: string | null
  bankAccount?: string | null
  hourlyRate: number | null
  period: PayrollPeriod
  /** 직원별 기본 공제 — 급여정산의 '기본 공제 일괄 적용'이 이 값을 쓴다 */
  defaultDeduction: DefaultDeduction | null
  onDefaultDeductionChanged: () => void
  /** 근무표엔 있는데 출근을 안 찍은 날(주방 월별 정산만) — 이 날들은 계획 시간 그대로 급여에 들어가 있다 */
  missingClockIns?: MissingClockIn[]
  /** 이 달 국민연금 판정(월별 정산만) — 대상이면 공제 안내를 띄우고 카톡 복사 문구에 상태를 적는다 */
  pension?: PensionRow | null
  onClose: () => void
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${dateStr.slice(5)} (${DAY_KO[d.getDay()]})`
}

export default function PayrollDetailModal({
  staffId, periodKey, initialAdjustments, onAdjustmentsChanged,
  name, phone, bankName, bankAccount, hourlyRate, period, defaultDeduction, onDefaultDeductionChanged, missingClockIns = [], pension = null, onClose,
}: Props) {
  const missingDates = new Set(missingClockIns.map(m => m.workDate))
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
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>(initialAdjustments)
  const [presets, setPresets] = useState<{ id: number; label: string; amount: number }[]>([])
  const [savingAdj, setSavingAdj] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [pctLabel, setPctLabel] = useState('')
  const [pctValue, setPctValue] = useState('')
  const [copied, setCopied] = useState(false)
  const [defaultDed, setDefaultDed] = useState<DefaultDeduction | null>(defaultDeduction)

  const changeDefaultDeduction = async (value: DefaultDeduction | null) => {
    const prev = defaultDed
    setDefaultDed(value)
    const res = await setStaffDefaultDeduction(staffId, value)
    if (!res.success) { setDefaultDed(prev); showMsg(`오류: ${res.error}`); return }
    showMsg(value ? `${name}님 기본 공제: ${DEFAULT_DEDUCTIONS[value]}` : `${name}님 기본 공제를 해제했습니다`)
    onDefaultDeductionChanged()
  }

  // period.type이 바뀌어도 안전하게 재조회되도록 두 케이스에서 다른 primitive 키를 쓴다
  const detailFetchKey = period.type === 'month' ? `month:${period.year}-${period.month}` : `popup:${period.popupId}`
  useEffect(() => {
    const detailPromise = period.type === 'month'
      ? fetchStaffMonthlyDetail(staffId, period.year, period.month)
      : fetchStaffPopupDetail(staffId, period.popupId)
    detailPromise.then(res => {
      setDetails(res.success && res.data ? res.data : [])
    })
    fetchAdjustmentPresets().then(res => { if (res.success && res.data) setPresets(res.data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, detailFetchKey])

  const periodLabel = period.type === 'month' ? `${period.year}년 ${period.month + 1}월` : period.popupName

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
  // 고용신고 보수총액은 세전 금액 — 원천징수·보험료 같은 공제(음수 조정)를 빼면 과소 신고가 된다
  const grossPay = basePay != null ? basePay + adjustments.reduce((s, a) => s + Math.max(0, a.amount), 0) : null

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

  // 조정 항목은 DB에 저장한다 — 모달을 닫으면 사라져 매달 다시 입력해야 했던 문제 해결
  const addAdjustment = async (label: string, amount: number, savePreset = true) => {
    if (!label.trim() || !Number.isFinite(amount)) return false
    setSavingAdj(true)
    const res = await addPayrollAdjustment(periodKey, staffId, label, Math.round(amount), savePreset)
    setSavingAdj(false)
    if (!res.success || !res.data) { showMsg(`오류: ${res.error}`); return false }
    setAdjustments(p => [...p, res.data!])
    if (savePreset) {
      setNewLabel('')
      setNewAmount('')
      fetchAdjustmentPresets().then(r => { if (r.success && r.data) setPresets(r.data) })
    }
    onAdjustmentsChanged()
    return true
  }

  // ── 바로 공제: 기본급 × 비율 ─────────────────────────────────────────────
  // 국민연금·건강보험·장기요양은 가입 대상이면 서버가 사람 단위(주방·캐셔·수당 합산)로 계산해 이 프로필 몫으로 나눈 금액을 쓴다 —
  // 이 화면의 기본급으로 따로 계산하면 수당이 빠지고, 프로필이 둘인 사람은 하한이 두 번 걸린다.
  const isSocialKind = (label: string) => ['pension', 'health', 'longTermCare'].includes(deductionKind(label) ?? '')
  const quickAmount = (label: string): number | null => {
    if (isSocialKind(label) && pension?.status === 'eligible') {
      return pension.deductions.find(d => isSameDeduction(d.label, label))?.amount ?? 0
    }
    return basePay != null ? quickDeductionAmount(label, basePay) : null
  }
  const addQuickDeductionAsync = async (label: string) => {
    if (basePay == null) return false
    const amount = quickAmount(label)
    if (amount == null || amount === 0) return true
    return addAdjustment(label, amount, false)
  }
  const addQuickDeduction = (label: string) => { void addQuickDeductionAsync(label) }

  // 근무가 바뀌어 기본급이 달라지면 저장된 공제 금액이 어긋난다 — 지우고 현재 기본급으로 다시 넣는다
  const recalcQuickDeduction = async (a: PayrollAdjustment) => {
    if (basePay == null) return
    const amount = quickAmount(a.label)
    if (amount == null) return
    const res = await removePayrollAdjustment(a.id)
    if (!res.success) { showMsg(`오류: ${res.error}`); return }
    setAdjustments(p => p.filter(x => x.id !== a.id))
    void addAdjustment(a.label, amount, false)
  }

  const submitPercentDeduction = async () => {
    const pct = Number(pctValue)
    if (basePay == null || !pctLabel.trim() || !(pct > 0 && pct < 100)) return
    const amount = percentDeduction(basePay, pct)
    if (amount === 0) return
    if (await addAdjustment(`${pctLabel.trim()} ${pct}%`, -amount, false)) {
      setPctLabel('')
      setPctValue('')
    }
  }

  const submitNewAdjustment = () => {
    const amount = Number(newAmount)
    if (!newLabel.trim() || !newAmount.trim() || isNaN(amount)) return
    void addAdjustment(newLabel, amount)
  }

  const deleteAdjustment = async (id: number) => {
    const prev = adjustments
    setAdjustments(p => p.filter(x => x.id !== id))
    const res = await removePayrollAdjustment(id)
    if (!res.success) { setAdjustments(prev); showMsg(`오류: ${res.error}`); return }
    onAdjustmentsChanged()
  }

  const deletePreset = async (id: number) => {
    setPresets(p => p.filter(x => x.id !== id))
    await removeAdjustmentPreset(id)
  }

  const handleShare = () => {
    const lines: string[] = [
      `📋 ${name} 님 ${periodLabel} 급여 내역`,
      '',
      `총 근무: ${details?.length ?? 0}일 / ${totalHours}h`,
    ]
    if (hourlyRate != null) lines.push(`시급: ${hourlyRate.toLocaleString('ko-KR')}원`)
    if (basePay != null) lines.push(`기본급: ${basePay.toLocaleString('ko-KR')}원`)
    if (pension && pension.status !== 'none') {
      lines.push(pension.status === 'eligible'
        ? `국민연금·건강보험: 가입 대상 (${pension.reasons.join(', ')})`
        : '국민연금·건강보험: 이번 달은 첫 달이라 제외 (다음 달도 근무하면 가입 대상)')
    }
    if (adjustments.length > 0) {
      lines.push('', '[ 조정 내역 ]')
      for (const a of adjustments) {
        lines.push(`${a.label}: ${a.amount >= 0 ? '+' : ''}${a.amount.toLocaleString('ko-KR')}원`)
      }
    }
    if (finalPay != null) lines.push('', `✅ 최종 지급액: ${finalPay.toLocaleString('ko-KR')}원`)
    if (formulaLines.length > 0) {
      lines.push('', '[ 계산식 ]', ...formulaLines)
    }
    if (details && details.length > 0) {
      lines.push('', '[ 근무 상세 ]')
      for (const d of details) {
        // 직원에게 보내는 문구라 간략하게 — 개별 조정 여부 같은 관리용 표기는 화면에만 둔다
        const breakNote = d.breakMinutes > 0 ? ` (휴게 ${minToH(d.breakMinutes)}h)` : ' (휴게 없음)'
        lines.push(`${d.date} ${d.shiftName} ${formatTimeRange(d.startTime, d.endTime)} = ${d.hours}h${breakNote}`)
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
            <h3 className="m-0 text-[16px] font-bold text-ink">
              <CopyText value={name} label="이름">{name}</CopyText>
            </h3>
            <p className="m-0 text-[12px] text-ink-muted">{periodLabel} 급여 세부내역</p>
          </div>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* 연락처 / 계좌 */}
          {(phone || bankAccount) && (
            <div className="flex flex-wrap gap-2">
              {phone && (
                <button
                  onClick={() => copyText('phone', formatPhoneNumber(phone))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft hover:bg-[#ececeb] transition text-[12px] text-ink cursor-pointer"
                >
                  <span className="text-ink-muted text-[10px] font-semibold">전화</span>
                  <span className="font-semibold">{formatPhoneNumber(phone)}</span>
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

          {/* 출근 기록 없는 날 — 어느 날이 계획 시간으로 계산됐는지 날짜별로 보여준다 */}
          {missingClockIns.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5">
              <p className="m-0 text-[12px] font-bold text-rose-600">출근 기록 없음 {missingClockIns.length}일</p>
              <p className="m-0 mt-0.5 text-[11px] text-ink-muted">
                근무표엔 있는데 출근을 찍지 않은 날이에요. 아래 계획 시간 그대로 급여에 들어가 있어요.
                결근이면 출근부에서 &lsquo;결근 처리&rsquo;, 일했으면 &lsquo;시간 정정&rsquo;을 해 주세요.
              </p>
              <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1">
                {missingClockIns.map(m => (
                  <li key={m.assignmentId} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-semibold text-ink">{formatDate(m.workDate)}</span>
                    <span className="text-ink-muted tabular-nums">
                      {m.plannedStart && m.plannedEnd ? `계획 ${formatTimeRange(m.plannedStart, m.plannedEnd)}` : '시간 미정'}
                    </span>
                  </li>
                ))}
              </ul>
              <a href="/attendance" className="inline-block mt-2 text-[11px] font-semibold text-rose-600 underline underline-offset-2">
                출근부에서 처리하기 →
              </a>
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
                <table className="w-full border-collapse text-[12px] select-text">
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
                        <td className="px-3 py-2 font-semibold text-ink whitespace-nowrap">
                          {formatDate(d.date)}
                          {missingDates.has(d.date) && (
                            <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 align-middle">출근 없음</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-ink-muted">{d.shiftName}</td>
                        <td className={`px-2 py-2 text-center whitespace-nowrap ${d.isCustomTime ? 'text-primary-700 font-semibold' : 'text-ink-muted'}`} title={d.isCustomTime ? '파트 기본 시간이 아닌 개별 수정 시간' : undefined}>
                          {formatTimeRange(d.startTime, d.endTime)}{d.isCustomTime && <span className="ml-0.5 align-super text-[9px]">*</span>}
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

          {/* 국민연금·건강보험 — 가입 대상인데 공제가 아직 없으면 바로 넣을 수 있게. 3.3%(사업소득)와는 같이 쓰지 않는다 */}
          {pension && pension.status !== 'none' && (() => {
            const missing = SOCIAL_INSURANCE_LABELS.filter(l => !adjustments.some(a => isSameDeduction(a.label, l)))
            const withholdingSaved = adjustments.some(a => isSameDeduction(a.label, WITHHOLDING_LABEL))
            const amount = basePay != null ? missing.reduce((s, l) => s + (quickAmount(l) ?? 0), 0) : null
            return (
              <div className={`rounded-lg border px-3 py-2.5 ${pension.status === 'eligible' ? 'border-indigo-200 bg-indigo-50/60' : 'border-hairline bg-canvas-soft'}`}>
                <p className={`m-0 text-[12px] font-bold ${pension.status === 'eligible' ? 'text-indigo-700' : 'text-ink-muted'}`}>
                  {pension.status === 'eligible' ? '국민연금·건강보험 가입 대상' : '국민연금·건강보험 첫 달 — 이번 달은 제외'}
                  <span className="ml-1 font-normal">· {pension.reasons.join(', ')}</span>
                </p>
                <p className="m-0 mt-0.5 text-[11px] text-ink-muted">
                  주방·캐셔 합산 {pension.days}일 · {pension.hours}h · {pension.pay.toLocaleString('ko-KR')}원
                  {pension.status === 'first-month' && ' — 다음 달까지 이어서 일하면 가입 대상'}
                </p>
                {pension.status === 'eligible' && missing.length > 0 && amount != null && amount !== 0 && (
                  <button
                    type="button"
                    onClick={async () => { for (const l of missing) { if (!(await addQuickDeductionAsync(l))) break } }}
                    disabled={savingAdj}
                    className="mt-2 px-2.5 py-1 rounded-full border border-indigo-300 bg-canvas text-indigo-700 text-[11px] font-bold cursor-pointer hover:bg-indigo-50 transition disabled:opacity-50"
                  >
                    {missing.length === SOCIAL_INSURANCE_LABELS.length ? '국민연금·건강보험' : missing.join('·')} 공제 넣기 ({amount.toLocaleString('ko-KR')}원)
                  </button>
                )}
                {pension.status === 'eligible' && withholdingSaved && (
                  <p className="m-0 mt-1.5 text-[11px] font-semibold text-amber-700">
                    3.3%(사업소득)가 들어가 있어요 — 국민연금 가입자는 근로소득(4대보험)으로 처리하는 게 원칙이라 세무 처리를 확인하세요.
                  </p>
                )}
              </div>
            )
          })()}

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
                    : basePay != null
                      ? <CopyText value={basePay.toLocaleString('ko-KR')} label="기본급" toastValue={`${basePay.toLocaleString('ko-KR')}원`}>{basePay.toLocaleString('ko-KR')}원</CopyText>
                      : <span className="text-ink-faint font-normal text-[11px]">시급 미설정</span>}
                </span>
              </div>

              {/* 조정 항목 목록 */}
              {adjustments.map(a => {
                const expected = basePay != null ? quickAmount(a.label) : null
                return (
                <div key={a.id} className="flex justify-between items-center px-3 py-2 border-b border-hairline group">
                  <span className="text-[12px] text-ink">
                    {a.label}
                    {expected != null && expected !== a.amount && (
                      <button
                        onClick={() => recalcQuickDeduction(a)}
                        disabled={savingAdj}
                        title="기본급이 바뀌어 공제 금액이 맞지 않습니다"
                        className="ml-2 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        기본급 변경됨 · 다시 계산 ({expected.toLocaleString('ko-KR')}원)
                      </button>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] font-semibold ${a.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {a.amount >= 0 ? '+' : ''}{a.amount.toLocaleString('ko-KR')}원
                    </span>
                    <button
                      onClick={() => deleteAdjustment(a.id)}
                      className="text-ink-faint text-[16px] bg-transparent border-none cursor-pointer hover:text-rose-500 transition opacity-0 group-hover:opacity-100 leading-none"
                    >×</button>
                  </div>
                </div>
                )
              })}

              {/* 바로 공제 — 기본급 기준 비율 계산. 고정 금액 프리셋으로는 저장하지 않는다 */}
              {basePay != null && basePay > 0 && (
                <div className="px-3 py-2 border-b border-hairline">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-ink-muted mr-0.5">바로 공제</span>
                    {[WITHHOLDING_LABEL, EMPLOYMENT_INSURANCE_LABEL, PENSION_LABEL, HEALTH_LABEL, LONG_TERM_CARE_LABEL].map(label => {
                      const amount = quickAmount(label) ?? 0
                      const added = adjustments.some(a => isSameDeduction(a.label, label))
                      return (
                        <button
                          key={label}
                          onClick={() => addQuickDeduction(label)}
                          disabled={savingAdj || added}
                          title={added ? '이미 추가됨' : isSocialKind(label) && pension?.status === 'eligible'
                            ? `주방·캐셔·수당 합산 보수 ${pension.pay.toLocaleString('ko-KR')}원 기준(이 프로필 몫)`
                            : `기본급 ${basePay.toLocaleString('ko-KR')}원 기준`}
                          className="px-2 py-1 rounded-full border border-primary-700/30 bg-primary-50 text-primary-700 text-[11px] font-bold cursor-pointer hover:bg-primary-100 transition disabled:opacity-40 disabled:cursor-default"
                        >
                          {label} {amount.toLocaleString('ko-KR')}원
                        </button>
                      )
                    })}
                    <label className="ml-auto flex items-center gap-1 text-[11px] text-ink-muted" title="급여정산 목록의 '기본 공제 일괄 적용'이 매달 이 공제를 넣는다">
                      기본 공제
                      <select
                        value={defaultDed ?? ''}
                        onChange={e => changeDefaultDeduction(isDefaultDeduction(e.target.value) ? e.target.value : null)}
                        className="px-1.5 py-1 border border-hairline rounded-lg text-[11px] bg-canvas cursor-pointer focus:outline-none focus:border-primary-700"
                      >
                        <option value="">없음</option>
                        {(Object.keys(DEFAULT_DEDUCTIONS) as DefaultDeduction[]).map(k => (
                          <option key={k} value={k}>{DEFAULT_DEDUCTIONS[k]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <input
                      type="text" value={pctLabel} onChange={e => setPctLabel(e.target.value)}
                      placeholder="공제 항목명 (예: 국민연금)"
                      className="flex-1 px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700 min-w-0"
                      onKeyDown={e => e.key === 'Enter' && submitPercentDeduction()}
                    />
                    <div className="relative w-[88px]">
                      <input
                        type="number" inputMode="decimal" step="0.1" value={pctValue} onChange={e => setPctValue(e.target.value)}
                        placeholder="비율"
                        className="w-full pl-2 pr-6 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700"
                        onKeyDown={e => e.key === 'Enter' && submitPercentDeduction()}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint">%</span>
                    </div>
                    <button
                      onClick={submitPercentDeduction}
                      disabled={savingAdj || !pctLabel.trim() || !(Number(pctValue) > 0 && Number(pctValue) < 100)}
                      className="px-2.5 py-1.5 rounded-lg border border-primary-700 bg-canvas text-primary-700 text-[11px] font-bold cursor-pointer hover:bg-primary-50 transition whitespace-nowrap disabled:opacity-40"
                    >
                      − {pctValue && Number(pctValue) > 0 && Number(pctValue) < 100
                        ? `${percentDeduction(basePay, Number(pctValue)).toLocaleString('ko-KR')}원`
                        : '% 공제'}
                    </button>
                  </div>
                </div>
              )}

              {/* 조정 항목 추가 */}
              <div className="px-3 py-2 border-b border-hairline bg-canvas-soft">
                <div className="flex gap-1.5">
                  <input
                    type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                    placeholder="항목명 (식대, 교통비, 공제...)"
                    className="flex-1 px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700 min-w-0"
                    onKeyDown={e => e.key === 'Enter' && submitNewAdjustment()}
                  />
                  <input
                    type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                    placeholder="금액 (+/-)"
                    className="w-[88px] px-2 py-1.5 border border-hairline rounded-lg text-[11px] bg-canvas focus:outline-none focus:border-primary-700"
                    onKeyDown={e => e.key === 'Enter' && submitNewAdjustment()}
                  />
                  <button
                    onClick={submitNewAdjustment}
                    disabled={savingAdj}
                    className="px-2.5 py-1.5 rounded-lg bg-primary-700 text-white text-[11px] font-bold border-none cursor-pointer hover:bg-primary-800 transition whitespace-nowrap disabled:opacity-50"
                  >
                    + 추가
                  </button>
                </div>
                {/* 자주 쓰는 항목 — 한 번 쓴 조합이 프리셋으로 쌓여 다음 달엔 클릭 한 번 */}
                {presets.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {presets.map(pr => (
                      <span key={pr.id} className="group inline-flex items-center rounded-full border border-hairline bg-canvas overflow-hidden">
                        <button
                          onClick={() => addAdjustment(pr.label, pr.amount)}
                          disabled={savingAdj}
                          title="클릭해서 이 항목 추가"
                          className="pl-2 pr-1 py-0.5 text-[10px] font-semibold text-ink-muted bg-transparent border-none cursor-pointer hover:text-primary-700 transition disabled:opacity-50"
                        >
                          {pr.label} {pr.amount >= 0 ? '+' : ''}{pr.amount.toLocaleString('ko-KR')}
                        </button>
                        <button
                          onClick={() => deletePreset(pr.id)}
                          title="이 프리셋 삭제"
                          className="pr-1.5 pl-0.5 py-0.5 text-[11px] leading-none text-ink-faint bg-transparent border-none cursor-pointer hover:text-rose-500 transition"
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
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
                  {finalPay != null
                    ? <CopyText value={finalPay.toLocaleString('ko-KR')} label="최종 지급액" toastValue={`${finalPay.toLocaleString('ko-KR')}원`}>{finalPay.toLocaleString('ko-KR')}원</CopyText>
                    : '—'}
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
              <div className="rounded-lg border border-hairline bg-canvas-soft px-3 py-2.5 font-mono text-[11px] text-ink leading-relaxed whitespace-pre-wrap break-words select-text">
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

        {/* 우측: 근로복지공단 단기간근로자 고용신고 서식 작성용 */}
        <div className="border-t md:border-t-0 md:border-l border-hairline flex flex-col w-full md:w-[420px] md:min-w-[420px] min-h-[420px] md:min-h-0">
          <WelfareReportPanel
            staffId={staffId}
            name={name}
            phone={phone}
            period={period}
            details={details}
            grossPay={grossPay}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
