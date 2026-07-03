'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StaffProfile, RosterShift } from '@/types/database'
import type { ContractData, WorkDaySchedule } from '@/components/ContractDocument'

const PDFPreviewPanel = dynamic(() => import('@/components/PDFPreviewPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-ink-muted text-sm">미리보기 로딩 중...</div>
  ),
})

interface Props {
  staff: StaffProfile
  allShifts: RosterShift[]
  onClose: () => void
}

// staff preferred_days: 0=일,1=월,...,6=토 → contract day label
const STAFF_DAY_TO_CONTRACT: Record<number, string> = {
  0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토',
}
const CONTRACT_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

function today() { return new Date().toISOString().slice(0, 10) }

const DEFAULT_DAY_SCHEDULE = (): WorkDaySchedule => ({
  day: '', startTime: '10:30', endTime: '18:00', breakStart: '13:00', breakEnd: '14:00',
})

export default function HrContractModal({ staff, allShifts, onClose }: Props) {
  // 사업주 정보
  const [employerName, setEmployerName] = useState('초이초이 - (히요리산도)')
  const [employerAddress, setEmployerAddress] = useState('경기 동두천시 동두천로119 1층 102호')
  const [employerRepresentative, setEmployerRepresentative] = useState('최진우')
  const [employerPhone, setEmployerPhone] = useState('010-8366-2414')

  // 근로자 정보
  const [workerPhone, setWorkerPhone] = useState(staff.phone ?? '')
  const [workerAddress, setWorkerAddress] = useState('')

  // 계약 기간
  const [startDate, setStartDate] = useState(staff.available_ranges[0]?.from ?? '')
  const [endDate, setEndDate] = useState(staff.available_ranges[0]?.to ?? '')

  // 근무지 / 업무내용
  const [workplace, setWorkplace] = useState('경기 동두천시 동두천로119 1층 102호')
  const [jobDescription, setJobDescription] = useState('팝업스토어 운영 (주문 접수, 결제, 재고 관리)')

  // 근로 요일
  const preferredShifts = useMemo(
    () => staff.preferred_shift_ids.map(id => allShifts.find(s => s.id === id)).filter(Boolean) as RosterShift[],
    [staff, allShifts],
  )
  const defaultStart = preferredShifts[0]?.start_time ?? '10:30'
  const defaultEnd = preferredShifts[0]?.end_time ?? '18:00'

  const initDays = useMemo(() =>
    staff.preferred_days.map(d => STAFF_DAY_TO_CONTRACT[d]).filter(Boolean),
    [staff],
  )

  const [selectedDays, setSelectedDays] = useState<string[]>(initDays)
  const [daySchedules, setDaySchedules] = useState<Record<string, WorkDaySchedule>>(() =>
    Object.fromEntries(CONTRACT_DAYS.map(d => [d, { ...DEFAULT_DAY_SCHEDULE(), day: d, startTime: defaultStart, endTime: defaultEnd }]))
  )
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

  const toggleDay = (d: string) =>
    setSelectedDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort((a, b) => CONTRACT_DAYS.indexOf(a as typeof CONTRACT_DAYS[number]) - CONTRACT_DAYS.indexOf(b as typeof CONTRACT_DAYS[number])))

  const updateDayField = (day: string, field: keyof WorkDaySchedule, value: string) =>
    setDaySchedules(p => ({ ...p, [day]: { ...p[day], [field]: value } }))

  const contractData: ContractData = useMemo(() => ({
    employerName, employerAddress, employerRepresentative, employerPhone,
    workerName: staff.name,
    workerPhone: workerPhone || undefined,
    workerAddress: workerAddress || undefined,
    startDate, endDate: endDate || undefined,
    workplace, jobDescription,
    workDays: selectedDays.map(d => ({ ...daySchedules[d], day: d })),
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
  }), [
    employerName, employerAddress, employerRepresentative, employerPhone,
    staff.name, workerPhone, workerAddress,
    startDate, endDate, workplace, jobDescription,
    selectedDays, daySchedules, weeklyHolidayDay,
    hourlyRate, paymentDay, paymentTransfer,
    insuranceEmployment, insuranceIndustrial, insurancePension, insuranceHealth,
    specialTerms,
  ])

  const [previewData, setPreviewData] = useState<ContractData>(contractData)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPreviewData(contractData), 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [contractData])

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
      <div className="bg-canvas w-full max-w-[1100px] max-h-[95vh] rounded-xl shadow-level-2 border border-hairline flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline bg-canvas-soft shrink-0">
          <h3 className="m-0 text-[15px] font-bold text-ink">{staff.name} — 근로계약서</h3>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none">×</button>
        </div>

        {/* 본문: 좌측 폼 + 우측 미리보기 */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 좌측: 입력 폼 */}
          <div className="w-[420px] shrink-0 overflow-y-auto p-4 flex flex-col gap-3 border-r border-hairline [scrollbar-width:thin]">

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
            </div>

            {/* 근무지 / 업무 */}
            <div className="grid grid-cols-1 gap-1.5">
              <div><label className={labelCls}>근무장소</label><input value={workplace} onChange={e => setWorkplace(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>업무내용</label><input value={jobDescription} onChange={e => setJobDescription(e.target.value)} className={inputCls} /></div>
            </div>

            {/* 근무 요일 */}
            <div>
              <p className="m-0 mb-1.5 text-[11px] font-bold text-ink-muted uppercase tracking-wide">근무 요일</p>
              <div className="flex gap-1 flex-wrap mb-2">
                {CONTRACT_DAYS.map(d => (
                  <button key={d} type="button" onClick={() => toggleDay(d)} className={chipCls(selectedDays.includes(d))}>{d}</button>
                ))}
              </div>
              {selectedDays.length > 0 && (
                <div className="flex flex-col gap-1">
                  {selectedDays.map(d => (
                    <div key={d} className="flex items-center gap-1 text-[11px]">
                      <span className="w-5 font-bold text-ink-muted shrink-0">{d}</span>
                      <input type="time" value={daySchedules[d]?.startTime ?? '10:30'} onChange={e => updateDayField(d, 'startTime', e.target.value)} className="flex-1 px-1.5 py-1 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <span className="text-ink-faint shrink-0">~</span>
                      <input type="time" value={daySchedules[d]?.endTime ?? '18:00'} onChange={e => updateDayField(d, 'endTime', e.target.value)} className="flex-1 px-1.5 py-1 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <span className="text-ink-faint text-[10px] shrink-0">휴게</span>
                      <input type="time" value={daySchedules[d]?.breakStart ?? '13:00'} onChange={e => updateDayField(d, 'breakStart', e.target.value)} className="flex-1 px-1.5 py-1 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                      <span className="text-ink-faint shrink-0">~</span>
                      <input type="time" value={daySchedules[d]?.breakEnd ?? '14:00'} onChange={e => updateDayField(d, 'breakEnd', e.target.value)} className="flex-1 px-1.5 py-1 border border-hairline rounded text-[11px] bg-canvas focus:outline-none focus:border-primary-700" />
                    </div>
                  ))}
                </div>
              )}
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
          </div>

          {/* 우측: PDF 미리보기 */}
          <div className="flex-1 min-w-0 bg-canvas-soft flex flex-col">
            <div className="px-4 py-2 border-b border-hairline bg-canvas text-[11px] text-ink-muted font-semibold shrink-0">미리보기</div>
            <div className="flex-1 min-h-0">
              <PDFPreviewPanel contractData={previewData} />
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-hairline bg-canvas-soft shrink-0">
          <p className="m-0 text-[11px] text-ink-faint">계약서는 미리보기 우측 상단 다운로드 버튼으로 저장하세요</p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-canvas border border-hairline text-[12px] font-semibold text-ink-secondary cursor-pointer hover:bg-canvas-soft transition">닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
