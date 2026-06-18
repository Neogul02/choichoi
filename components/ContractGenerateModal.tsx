'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import SignaturePad from './SignaturePad'
import { generateContract, fetchWorkerScheduleForContract } from '@/app/actions/contracts'
import { fetchPopupEvents } from '@/app/actions/schedule'
import type { UserProfile } from '@/app/actions/workers'
import type { PopupEvent } from '@/types/database'
import type { ContractData, WorkDaySchedule } from './ContractDocument'

// 클라이언트 전용 PDF 미리보기
const PDFPreviewPanel = dynamic(() => import('./PDFPreviewPanel'), {
  ssr: false,
  loading: () => (
    <div className='flex items-center justify-center h-full text-ink-muted text-sm'>
      미리보기 로딩 중...
    </div>
  ),
})

interface Props {
  user: UserProfile
  workerId: number
  onClose: () => void
  onSuccess: () => void
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const defaultDaySchedule = (): WorkDaySchedule => ({
  day: '', startTime: '10:30', endTime: '18:00', breakStart: '13:00', breakEnd: '14:00',
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ContractGenerateModal({ user, workerId, onClose, onSuccess }: Props) {
  const [popups, setPopups] = useState<PopupEvent[]>([])
  const [popupId, setPopupId] = useState('')

  // 사업주 정보
  const [employerName, setEmployerName] = useState('초이초이 - (히요리산도)')
  const [employerAddress, setEmployerAddress] = useState('경기 동두천시 동두천로119 1층 102호')
  const [employerRepresentative, setEmployerRepresentative] = useState('최진우')
  const [employerPhone, setEmployerPhone] = useState('010-8366-2414')

  // 계약 기간 / 근무
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [workplace, setWorkplace] = useState('')
  const [jobDescription, setJobDescription] = useState('팝업스토어 운영 (주문 접수, 결제, 재고 관리)')

  // 근로일별 근로시간
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [daySchedules, setDaySchedules] = useState<Record<string, WorkDaySchedule>>(() =>
    Object.fromEntries(DAYS.map(d => [d, { ...defaultDaySchedule(), day: d }]))
  )
  const [weeklyHolidayDay, setWeeklyHolidayDay] = useState('')

  // 임금
  const [hourlyRate, setHourlyRate] = useState('10320')
  const [includesHolidayPay, setIncludesHolidayPay] = useState(false)
  const [hasBonus, setHasBonus] = useState(false)
  const [bonusAmount, setBonusAmount] = useState('')
  const [hasOtherAllowance, setHasOtherAllowance] = useState(false)
  const [otherAllowanceAmount, setOtherAllowanceAmount] = useState('50') // 초과근로 가산임금률 (기본 50%)
  const [overtimeRate, setOvertimeRate] = useState('50') // 초과근로 가산임금률
  const [paymentDay, setPaymentDay] = useState('25')
  const [paymentDirect, setPaymentDirect] = useState(false)
  const [paymentTransfer, setPaymentTransfer] = useState(true)

  // 사회보험
  const [insuranceEmployment, setInsuranceEmployment] = useState(true)
  const [insuranceIndustrial, setInsuranceIndustrial] = useState(true)
  const [insurancePension, setInsurancePension] = useState(false)
  const [insuranceHealth, setInsuranceHealth] = useState(false)

  // 서명
  const [signatureBase64, setSignatureBase64] = useState<string | undefined>()

  const [isPending, startTransition] = useTransition()
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false)

  useEffect(() => {
    fetchPopupEvents().then(res => {
      if (res.success && res.data) {
        setPopups(res.data)
        if (res.data.length > 0) {
          const last = res.data[res.data.length - 1]
          setPopupId(String(last.id))
          setStartDate(last.start_date)
          setEndDate(last.end_date)
        }
      }
    })
  }, [])

  // popup 선택 시 날짜 자동 반영
  const handlePopupChange = (pid: string) => {
    setPopupId(pid)
    const popup = popups.find(p => String(p.id) === pid)
    if (popup) { setStartDate(popup.start_date); setEndDate(popup.end_date) }
  }

  const toggleDay = (d: string) => {
    setSelectedDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => DAYS.indexOf(a as typeof DAYS[number]) - DAYS.indexOf(b as typeof DAYS[number]))
    )
  }

  const updateDayField = (day: string, field: keyof WorkDaySchedule, value: string) => {
    setDaySchedules(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
  }

  // PDF 데이터
  const contractData: ContractData = useMemo(() => ({
    employerName,
    employerAddress,
    employerRepresentative,
    employerPhone,
    workerName: user.name,
    workerAddress: user.phone ? '' : undefined,
    workerPhone: user.phone ?? undefined,
    startDate,
    endDate: endDate || undefined,
    workplace,
    jobDescription,
    workDays: selectedDays.map(d => ({ ...daySchedules[d], day: d })),
    weeklyHolidayDay,
    hourlyRate: parseInt(hourlyRate) || 0,
    hasBonus,
    bonusAmount: hasBonus ? parseInt(bonusAmount) || undefined : undefined,
    hasOtherAllowance,
    otherAllowanceAmount: hasOtherAllowance ? parseInt(otherAllowanceAmount) || undefined : undefined,
    overtimeRate: parseInt(overtimeRate) || 50,
    paymentDay,
    paymentDirect,
    paymentTransfer,
    insuranceEmployment,
    insuranceIndustrial,
    insurancePension,
    insuranceHealth,
    employerSignatureBase64: signatureBase64,
    includesHolidayPay,
    issueDate: today(),
  }), [
    employerName, employerAddress, employerRepresentative, employerPhone,
    user.name, user.phone,
    startDate, endDate, workplace, jobDescription,
    selectedDays, daySchedules, weeklyHolidayDay,
    hourlyRate, hasBonus, bonusAmount, hasOtherAllowance, otherAllowanceAmount,
    overtimeRate, paymentDay, paymentDirect, paymentTransfer,
    insuranceEmployment, insuranceIndustrial, insurancePension, insuranceHealth,
    signatureBase64, includesHolidayPay,
  ])

  // 800ms debounce — 입력 중 깜빡임 방지
  const [previewData, setPreviewData] = useState<ContractData>(contractData)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPreviewData(contractData), 800)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [contractData])

  const handleLoadFromSchedule = async () => {
    if (!popupId) { toast.error('팝업 이벤트를 먼저 선택하세요.'); return }
    setIsLoadingSchedule(true)
    try {
      const res = await fetchWorkerScheduleForContract(workerId, parseInt(popupId))
      if (!res.success) { toast.error(`일정 불러오기 실패: ${res.error}`); return }
      if (!res.data?.length) { toast.warning('해당 팝업에 연결된 일정이 없습니다.'); return }
      const newDaySchedules = { ...daySchedules }
      res.data.forEach(ds => { newDaySchedules[ds.day] = ds })
      setDaySchedules(newDaySchedules)
      setSelectedDays(res.data.map(ds => ds.day))
      toast.success(`${res.data.length}개 근무일을 불러왔습니다.`)
    } finally {
      setIsLoadingSchedule(false)
    }
  }

  const handleSubmit = () => {
    if (!startDate) { toast.error('계약 시작일을 입력하세요.'); return }
    const rate = parseInt(hourlyRate, 10)
    if (!rate || rate < 0) { toast.error('시급을 올바르게 입력하세요.'); return }

    startTransition(async () => {
      const res = await generateContract({
        workerId,
        workerName: user.name,
        popupId: popupId ? parseInt(popupId, 10) : undefined,
        startDate,
        endDate: endDate || undefined,
        hourlyRate: rate,
        workplace: workplace.trim() || undefined,
        workSchedule: selectedDays.length > 0
          ? selectedDays.map(d => `${d} ${daySchedules[d].startTime}~${daySchedules[d].endTime}`).join(', ')
          : undefined,
        signatureBase64,
        contractData,
      })
      if (res.success) {
        toast.success('근로계약서가 생성됐습니다.')
        onSuccess()
        onClose()
      } else {
        toast.error(`계약서 생성 실패: ${res.error}`)
      }
    })
  }

  const inputCls = 'w-full border border-hairline rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-primary-700 bg-canvas'
  const labelCls = 'block text-[11px] text-ink-muted mb-1'
  const sectionCls = 'border-t border-hairline pt-3 mt-1'

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3'>
      <div className='bg-canvas rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col'>

        {/* 헤더 */}
        <div className='flex items-center justify-between px-6 py-3.5 border-b border-hairline shrink-0'>
          <h2 className='text-[14px] font-bold text-ink'>단시간근로자 표준근로계약서 작성</h2>
          <button type='button' onClick={onClose}
            className='text-ink-muted hover:text-ink text-xl leading-none bg-transparent border-none cursor-pointer'>✕</button>
        </div>

        {/* 본문 — 좌: 폼 / 우: 미리보기 */}
        <div className='flex flex-1 min-h-0'>

          {/* ── 좌측: 폼 ── */}
          <div className='w-[420px] shrink-0 overflow-y-auto px-5 py-4 space-y-3 border-r border-hairline'>

            {/* 근로자 */}
            <div className='bg-canvas-soft rounded-xl p-3'>
              <p className='text-[10px] text-ink-muted mb-0.5'>근로자</p>
              <p className='text-[14px] font-bold text-ink'>{user.name}</p>
              {user.phone && <p className='text-[11px] text-ink-muted'>{user.phone}</p>}
            </div>

            {/* 팝업 선택 */}
            <div>
              <label className={labelCls}>팝업 이벤트</label>
              <select value={popupId} onChange={e => handlePopupChange(e.target.value)} className={inputCls}>
                <option value=''>선택 안 함</option>
                {popups.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name} ({p.start_date} ~ {p.end_date})</option>
                ))}
              </select>
            </div>

            {/* 계약 기간 */}
            <div className='grid grid-cols-2 gap-2'>
              <div>
                <label className={labelCls}>근로개시일 *</label>
                <input type='date' value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>종료일 (없으면 공란)</label>
                <input type='date' value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* 사업주 정보 */}
            <div className={sectionCls}>
              <p className='text-[11px] font-bold text-ink mb-2'>사업주 정보</p>
              <div className='space-y-2'>
                <div>
                  <label className={labelCls}>사업체명</label>
                  <input value={employerName} onChange={e => setEmployerName(e.target.value)} className={inputCls} />
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <div>
                    <label className={labelCls}>대표자</label>
                    <input value={employerRepresentative} onChange={e => setEmployerRepresentative(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>전화번호</label>
                    <input value={employerPhone} onChange={e => setEmployerPhone(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>주소</label>
                  <input value={employerAddress} onChange={e => setEmployerAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>

            {/* 근무 장소 / 업무 내용 */}
            <div className={sectionCls}>
              <p className='text-[11px] font-bold text-ink mb-2'>근무 조건</p>
              <div className='space-y-2'>
                <div>
                  <label className={labelCls}>근무 장소</label>
                  <input value={workplace} onChange={e => setWorkplace(e.target.value)} placeholder='예: 수원 AK플라자 1층' className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>업무의 내용</label>
                  <input value={jobDescription} onChange={e => setJobDescription(e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>

            {/* 근로일별 근로시간 */}
            <div className={sectionCls}>
              <div className='flex items-center justify-between mb-2'>
                <p className='text-[11px] font-bold text-ink'>근로일 및 근로시간</p>
                <button type='button' onClick={handleLoadFromSchedule}
                  disabled={isLoadingSchedule || !popupId}
                  className='text-[10px] text-primary-700 border border-primary-700 rounded-full px-2.5 py-0.5 disabled:opacity-40 cursor-pointer hover:bg-primary-50 transition-colors bg-transparent'>
                  {isLoadingSchedule ? '불러오는 중...' : '일정에서 불러오기'}
                </button>
              </div>
              <div className='flex gap-1 flex-wrap mb-3'>
                {DAYS.map(d => (
                  <button key={d} type='button' onClick={() => toggleDay(d)}
                    className={`w-8 h-8 rounded-full text-[11px] font-bold border cursor-pointer transition ${selectedDays.includes(d) ? 'bg-primary-700 text-white border-primary-700' : 'bg-canvas text-ink-muted border-hairline'}`}>
                    {d}
                  </button>
                ))}
              </div>
              {selectedDays.length > 0 && (
                <div className='space-y-2'>
                  {selectedDays.map(d => (
                    <div key={d} className='bg-canvas-soft rounded-lg p-2'>
                      <p className='text-[10px] font-bold text-ink mb-1.5'>{d}요일</p>
                      <div className='grid grid-cols-2 gap-1.5'>
                        <div>
                          <label className='text-[10px] text-ink-muted'>시업</label>
                          <input type='text' placeholder='HH:MM' value={daySchedules[d].startTime}
                            onChange={e => updateDayField(d, 'startTime', e.target.value)}
                            className='w-full border border-hairline rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-primary-700 bg-canvas' />
                        </div>
                        <div>
                          <label className='text-[10px] text-ink-muted'>종업</label>
                          <input type='text' placeholder='HH:MM' value={daySchedules[d].endTime}
                            onChange={e => updateDayField(d, 'endTime', e.target.value)}
                            className='w-full border border-hairline rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-primary-700 bg-canvas' />
                        </div>
                        <div>
                          <label className='text-[10px] text-ink-muted'>휴게 시작</label>
                          <input type='text' placeholder='HH:MM' value={daySchedules[d].breakStart}
                            onChange={e => updateDayField(d, 'breakStart', e.target.value)}
                            className='w-full border border-hairline rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-primary-700 bg-canvas' />
                        </div>
                        <div>
                          <label className='text-[10px] text-ink-muted'>휴게 종료</label>
                          <input type='text' placeholder='HH:MM' value={daySchedules[d].breakEnd}
                            onChange={e => updateDayField(d, 'breakEnd', e.target.value)}
                            className='w-full border border-hairline rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-primary-700 bg-canvas' />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className='mt-2 flex items-center gap-2'>
                <label className={labelCls + ' mb-0'}>주휴일</label>
                <select value={weeklyHolidayDay} onChange={e => setWeeklyHolidayDay(e.target.value)}
                  className='border border-hairline rounded px-2 py-1 text-[11px] focus:outline-none focus:border-primary-700 bg-canvas'>
                  <option value=''>없음</option>
                  {DAYS.map(d => <option key={d} value={d}>{d}요일</option>)}
                </select>
              </div>
            </div>

            {/* 임금 */}
            <div className={sectionCls}>
              <p className='text-[11px] font-bold text-ink mb-2'>임금</p>
              <div className='space-y-2'>
                <div>
                  <label className={labelCls}>시급 (원) *</label>
                  <input type='number' value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} className={inputCls} />
                  <label className='flex items-center gap-1.5 mt-1.5 cursor-pointer select-none w-fit'>
                    <input type='checkbox' checked={includesHolidayPay} onChange={e => setIncludesHolidayPay(e.target.checked)}
                      className='w-3.5 h-3.5 cursor-pointer accent-emerald-600' />
                    <span className='text-[11px] text-ink-muted'>주휴수당 포함 시급</span>
                  </label>
                </div>
                <div className='flex items-center gap-3'>
                  <label className='flex items-center gap-1.5 cursor-pointer text-[11px]'>
                    <input type='checkbox' checked={hasBonus} onChange={e => setHasBonus(e.target.checked)} className='w-3.5 h-3.5 cursor-pointer' />
                    상여금 있음
                  </label>
                  {hasBonus && (
                    <input type='number' value={bonusAmount} onChange={e => setBonusAmount(e.target.value)}
                      placeholder='금액' className='flex-1 border border-hairline rounded px-2 py-1 text-[11px] focus:outline-none bg-canvas' />
                  )}
                </div>
                <div className='flex items-center gap-3'>
                  <label className='flex items-center gap-1.5 cursor-pointer text-[11px]'>
                    <input type='checkbox' checked={hasOtherAllowance} onChange={e => setHasOtherAllowance(e.target.checked)} className='w-3.5 h-3.5 cursor-pointer' />
                    기타급여 있음
                  </label>
                  {hasOtherAllowance && (
                    <input type='number' value={otherAllowanceAmount} onChange={e => setOtherAllowanceAmount(e.target.value)}
                      placeholder='금액' className='flex-1 border border-hairline rounded px-2 py-1 text-[11px] focus:outline-none bg-canvas' />
                  )}
                </div>
                <div className='grid grid-cols-2 gap-2'>
                  <div>
                    <label className={labelCls}>초과근로 가산임금률 (%)</label>
                    <input type='number' value={overtimeRate} onChange={e => setOvertimeRate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>임금지급일 (일)</label>
                    <input type='text' value={paymentDay} onChange={e => setPaymentDay(e.target.value)} placeholder='25' className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>지급방법</label>
                  <div className='flex gap-4'>
                    <label className='flex items-center gap-1.5 cursor-pointer text-[11px]'>
                      <input type='checkbox' checked={paymentDirect} onChange={e => setPaymentDirect(e.target.checked)} className='w-3.5 h-3.5 cursor-pointer' />
                      직접지급
                    </label>
                    <label className='flex items-center gap-1.5 cursor-pointer text-[11px]'>
                      <input type='checkbox' checked={paymentTransfer} onChange={e => setPaymentTransfer(e.target.checked)} className='w-3.5 h-3.5 cursor-pointer' />
                      통장입금
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 사회보험 */}
            <div className={sectionCls}>
              <p className='text-[11px] font-bold text-ink mb-2'>사회보험 적용여부</p>
              <div className='flex flex-wrap gap-4'>
                {[
                  { label: '고용보험', value: insuranceEmployment, set: setInsuranceEmployment },
                  { label: '산재보험', value: insuranceIndustrial, set: setInsuranceIndustrial },
                  { label: '국민연금', value: insurancePension, set: setInsurancePension },
                  { label: '건강보험', value: insuranceHealth, set: setInsuranceHealth },
                ].map(item => (
                  <label key={item.label} className='flex items-center gap-1.5 cursor-pointer text-[11px]'>
                    <input type='checkbox' checked={item.value} onChange={e => item.set(e.target.checked)} className='w-3.5 h-3.5 cursor-pointer' />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 사업주 서명 */}
            <div className={sectionCls}>
              <p className='text-[11px] font-bold text-ink mb-2'>사업주 서명</p>
              <SignaturePad
                onSave={b64 => { setSignatureBase64(b64); toast.success('서명이 저장됐습니다.') }}
                onClear={() => setSignatureBase64(undefined)}
              />
              {signatureBase64 && <p className='text-[10px] text-emerald-600 mt-1'>✓ 서명 완료</p>}
            </div>

            {/* 하단 버튼 */}
            <div className='flex gap-2 pt-2 pb-2'>
              <button type='button' onClick={handleSubmit} disabled={isPending}
                className='flex-1 border-none rounded-xl py-2.5 text-[12px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60'>
                {isPending ? 'PDF 생성 중...' : '계약서 생성 및 저장'}
              </button>
              <button type='button' onClick={onClose} disabled={isPending}
                className='flex-1 border border-hairline rounded-xl py-2.5 text-[12px] text-ink-muted hover:bg-canvas-soft transition-colors bg-transparent cursor-pointer disabled:opacity-60'>
                취소
              </button>
            </div>
          </div>

          {/* ── 우측: PDF 미리보기 ── */}
          <div className='flex-1 bg-canvas-soft flex flex-col'>
            <div className='px-4 py-2 border-b border-hairline bg-canvas text-[11px] text-ink-muted font-semibold shrink-0'>
              실시간 미리보기
            </div>
            <div className='flex-1 min-h-0'>
              <PDFPreviewPanel contractData={previewData} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
