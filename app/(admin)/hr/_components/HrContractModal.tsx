'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StaffProfile } from '@/types/database'
import type { ContractData, SpecificWorkDate } from '@/components/ContractDocument'
import { fetchStaffAssignmentsInRange } from '@/app/actions/payroll'
import { generateContract } from '@/app/actions/contracts'
import { showMsg } from '@/lib/toast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import SignaturePad from '@/components/SignaturePad'

const PDFPreviewPanel = dynamic(() => import('@/components/PDFPreviewPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-ink-muted text-sm">미리보기 로딩 중...</div>
  ),
})

interface Props {
  staff: StaffProfile
  onClose: () => void
  onComplete?: () => void
}

function today() { return new Date().toISOString().slice(0, 10) }

export default function HrContractModal({ staff, onClose, onComplete }: Props) {
  useBodyScrollLock()
  // 사업주 정보
  const [employerName, setEmployerName] = useState('초이초이 - (히요리산도)')
  const [employerAddress, setEmployerAddress] = useState('경기 동두천시 동두천로119 1층 102호')
  const [employerRepresentative, setEmployerRepresentative] = useState('최진우')
  const [employerPhone, setEmployerPhone] = useState('010-7633-2414')

  // 근로자 정보
  const [workerPhone, setWorkerPhone] = useState(staff.phone ?? '')
  const [workerAddress, setWorkerAddress] = useState('')

  // 계약 기간 — 기본값: 오늘부터 3개월 (스케줄 배정 기간 기준)
  const [startDate, setStartDate] = useState(() => today())
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().slice(0, 10)
  })

  // 근무지 / 업무내용
  const [workplace, setWorkplace] = useState('경기 동두천시 동두천로119 1층 102호')
  const [jobDescription, setJobDescription] = useState(
    staff.staff_role === 'kitchen'
      ? '과일 산도 제작, 주방 식재료 준비 및 정리, 주방 청결 유지 및 위생 관리'
      : '팝업스토어 운영 (주문 접수, 결제, 재고 관리)'
  )

  // 휴게시간 (전체 날짜에 공통 적용)
  const [breakStart, setBreakStart] = useState('13:00')
  const [breakEnd, setBreakEnd] = useState('14:00')
  const [weeklyHolidayDay, setWeeklyHolidayDay] = useState('')

  // 임금
  const [hourlyRate, setHourlyRate] = useState(staff.hourly_rate?.toString() ?? '10030')
  const [paymentDay, setPaymentDay] = useState('25')
  const [paymentTransfer, setPaymentTransfer] = useState(true)

  // 사회보험
  const [insuranceEmployment, setInsuranceEmployment] = useState(staff.wants_insurance)
  const [insuranceIndustrial, setInsuranceIndustrial] = useState(staff.wants_insurance)
  const [insurancePension, setInsurancePension] = useState(false)
  const [insuranceHealth, setInsuranceHealth] = useState(false)

  // 특약사항
  const [specialTerms, setSpecialTerms] = useState('')

  // 사업주 서명
  const [signatureBase64, setSignatureBase64] = useState<string | undefined>()

  // 실제 근무 날짜 (roster_assignments)
  const [specificWorkDates, setSpecificWorkDates] = useState<SpecificWorkDate[]>([])
  useEffect(() => {
    if (!startDate) { setSpecificWorkDates([]); return }
    // endDate 미입력 시 시작일로부터 3개월 후까지 조회
    let toDate = endDate
    if (!toDate) {
      const d = new Date(startDate + 'T00:00:00')
      d.setMonth(d.getMonth() + 3)
      toDate = d.toISOString().slice(0, 10)
    }
    fetchStaffAssignmentsInRange(staff.id, startDate, toDate).then(res => {
      setSpecificWorkDates(res.success && res.data ? res.data : [])
    })
  }, [staff.id, startDate, endDate])

  const contractData: ContractData = useMemo(() => ({
    employerName, employerAddress, employerRepresentative, employerPhone,
    workerName: staff.name,
    workerPhone: workerPhone || undefined,
    workerAddress: workerAddress || undefined,
    startDate, endDate: endDate || undefined,
    workplace, jobDescription,
    workDays: [],
    specificWorkDates: specificWorkDates.length > 0
      ? specificWorkDates.map(d => ({ ...d, breakStart, breakEnd }))
      : undefined,
    weeklyHolidayDay,
    hourlyRate: parseInt(hourlyRate) || 0,
    hasBonus: false,
    hasOtherAllowance: false,
    overtimeRate: 50,
    paymentDay,
    paymentDirect: false,
    paymentTransfer,
    insuranceEmployment, insuranceIndustrial, insurancePension, insuranceHealth,
    specialTerms: specialTerms || undefined,
    issueDate: today(),
    employerSignatureBase64: signatureBase64,
  }), [
    employerName, employerAddress, employerRepresentative, employerPhone,
    staff.name, workerPhone, workerAddress,
    startDate, endDate, workplace, jobDescription,
    breakStart, breakEnd, weeklyHolidayDay,
    hourlyRate, paymentDay, paymentTransfer,
    insuranceEmployment, insuranceIndustrial, insurancePension, insuranceHealth,
    specialTerms, specificWorkDates, signatureBase64,
  ])

  const [previewData, setPreviewData] = useState<ContractData>(contractData)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPreviewData(contractData), 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [contractData])

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleComplete = async () => {
    setSaving(true)
    const r = await generateContract({ workerId: staff.id, workerName: staff.name, startDate, hourlyRate: Number(hourlyRate), contractData })
    setSaving(false)
    if (r.success) {
      onComplete?.()
      onClose()
    } else {
      showMsg(`저장 실패: ${r.error}`)
    }
  }

  const inputCls = 'w-full px-2.5 py-1.5 border border-hairline rounded-lg text-[12px] bg-canvas focus:outline-none focus:border-primary-700'
  const labelCls = 'text-[10px] font-semibold text-ink-muted mb-0.5 block'
  const chipCls = (active: boolean) =>
    `px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition ${active ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline hover:border-primary-400'}`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-canvas w-full max-w-[1100px] max-h-[95vh] rounded-xl shadow-level-2 border border-hairline flex flex-col overflow-hidden"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-canvas-soft shrink-0">
          <h3 className="m-0 text-[15px] font-bold text-ink">{staff.name} — 근로계약서</h3>
          <button onClick={onClose} aria-label="닫기" className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none">×</button>
        </div>

        {/* 본문: 좌측 폼 + 우측 미리보기 — 모바일은 세로 스택, md 이상은 좌우 분할 */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          {/* 좌측: 입력 폼 */}
          <div className="w-full md:w-[420px] shrink-0 md:overflow-y-auto p-4 flex flex-col gap-3 border-b md:border-b-0 md:border-r border-hairline [scrollbar-width:thin]">

            {/* 사업주 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">사업주</p>
              <div className="grid grid-cols-2 gap-1.5">
                <div><label className={labelCls}>상호명</label><input value={employerName} onChange={e => setEmployerName(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>대표자</label><input value={employerRepresentative} onChange={e => setEmployerRepresentative(e.target.value)} className={inputCls} /></div>
                <div className="col-span-2"><label className={labelCls}>주소</label><input value={employerAddress} onChange={e => setEmployerAddress(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>전화</label><input value={employerPhone} onChange={e => setEmployerPhone(e.target.value)} className={inputCls} /></div>
              </div>
            </div>

            {/* 근로자 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">근로자</p>
              <div className="grid grid-cols-2 gap-1.5">
                <div><label className={labelCls}>이름</label><input value={staff.name} readOnly className={`${inputCls} bg-canvas-soft`} /></div>
                <div><label className={labelCls}>연락처</label><input value={workerPhone} onChange={e => setWorkerPhone(e.target.value)} className={inputCls} /></div>
                <div className="col-span-2"><label className={labelCls}>주소</label><input value={workerAddress} onChange={e => setWorkerAddress(e.target.value)} placeholder="(선택)" className={inputCls} /></div>
              </div>
            </div>

            {/* 계약기간 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">계약기간</p>
              <div className="flex items-center gap-1.5">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                <span className="text-ink-faint text-[11px] shrink-0">~</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
              </div>
              {startDate && endDate && (
                <p className="m-0 mt-1 text-[10px] text-ink-muted">
                  {specificWorkDates.length > 0
                    ? `스케줄 ${specificWorkDates.length}일 반영됨`
                    : '등록된 스케줄 없음'}
                </p>
              )}
            </div>

            {/* 근무지 / 업무 */}
            <div className="grid grid-cols-1 gap-1.5">
              <div><label className={labelCls}>근무장소</label><input value={workplace} onChange={e => setWorkplace(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>업무내용</label><input value={jobDescription} onChange={e => setJobDescription(e.target.value)} className={inputCls} /></div>
            </div>

            {/* 휴게시간 / 주휴일 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">휴게시간</p>
              <div className="flex items-center gap-1.5">
                <input type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)} className={inputCls} />
                <span className="text-ink-faint text-[11px] shrink-0">~</span>
                <input type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)} className={inputCls} />
              </div>
              <div className="mt-1.5"><label className={labelCls}>주휴일</label><input value={weeklyHolidayDay} onChange={e => setWeeklyHolidayDay(e.target.value)} placeholder="예: 일요일" className={inputCls} /></div>
            </div>

            {/* 임금 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">임금</p>
              <div className="grid grid-cols-2 gap-1.5">
                <div><label className={labelCls}>시급 (원)</label><input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>임금 지급일</label><input value={paymentDay} onChange={e => setPaymentDay(e.target.value)} placeholder="예: 25" className={inputCls} /></div>
              </div>
            </div>

            {/* 사회보험 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">사회보험</p>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  ['고용보험', insuranceEmployment, setInsuranceEmployment],
                  ['산재보험', insuranceIndustrial, setInsuranceIndustrial],
                  ['국민연금', insurancePension, setInsurancePension],
                  ['건강보험', insuranceHealth, setInsuranceHealth],
                ].map(([label, val, setter]) => (
                  <button key={label as string} type="button" onClick={() => (setter as (v: boolean) => void)(!val as boolean)} className={chipCls(val as boolean)}>{label as string}</button>
                ))}
              </div>
            </div>

            {/* 특약사항 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">특약사항 <span className="text-ink-faint font-normal normal-case">(선택)</span></p>
              <textarea
                value={specialTerms}
                onChange={e => setSpecialTerms(e.target.value)}
                rows={4}
                placeholder="특약사항을 입력하세요&#10;예: 수습기간 1개월 (시급의 90% 적용), 교통비 월정액 지급 등"
                className={`${inputCls} resize-y`}
              />
            </div>

            {/* 사업주 서명 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">사업주 서명</p>
              <SignaturePad
                onSave={b64 => setSignatureBase64(b64)}
                onClear={() => setSignatureBase64(undefined)}
              />
              {signatureBase64 && <p className="m-0 mt-1 text-[10px] text-emerald-600">✓ 서명 완료 — 미리보기에 반영됩니다</p>}
            </div>
          </div>

          {/* 우측: PDF 미리보기 */}
          <div className="flex-1 min-w-0 min-h-[480px] md:min-h-0 bg-canvas-soft flex flex-col">
            <div className="px-4 py-2 border-b border-hairline bg-canvas text-[11px] text-ink-muted font-semibold shrink-0">미리보기</div>
            <div className="flex-1 min-h-0">
              <PDFPreviewPanel contractData={previewData} />
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-hairline bg-canvas-soft shrink-0">
          <p className="m-0 text-[11px] text-ink-faint">계약서는 미리보기 우측 상단 다운로드 버튼으로 저장하세요</p>
          <div className="flex gap-2">
            {onComplete && (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-[12px] font-bold border-none cursor-pointer hover:bg-emerald-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving ? '저장 중...' : '✓ 작성완료'}
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-canvas border border-hairline text-[12px] font-semibold text-ink-secondary cursor-pointer hover:bg-canvas-soft transition">닫기</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
