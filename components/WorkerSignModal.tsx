'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import SignaturePad from '@/components/SignaturePad'
import { signContract } from '@/app/actions/contracts'
import type { ContractRecord } from '@/app/actions/contracts'
import type { ContractData } from '@/components/ContractDocument'
import { toast } from 'sonner'

const PDFPreviewPanel = dynamic(() => import('@/components/PDFPreviewPanel'), { ssr: false })

interface Props {
  contract: ContractRecord
  workerName: string
  workerPhone?: string
  onClose: () => void
  onSuccess: (updated: ContractRecord) => void
}

export default function WorkerSignModal({ contract, workerName, workerPhone, onClose, onSuccess }: Props) {
  const [workerAddress, setWorkerAddress] = useState('')
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // 모바일에서는 기본 폼 뷰, 데스크탑에서는 양쪽 모두 표시
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setShowPreview(mq.matches)
    const handler = (e: MediaQueryListEvent) => setShowPreview(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // contract_data가 없는 구형 계약서도 ContractRecord 필드로 최소 데이터 구성
  const baseData: ContractData = (contract.contract_data as ContractData | null) ?? {
    employerName: '', employerAddress: '', employerRepresentative: '', employerPhone: '',
    workerName, workerPhone: workerPhone,
    startDate: contract.start_date, endDate: contract.end_date ?? undefined,
    workplace: contract.workplace ?? '', jobDescription: '',
    workDays: [], weeklyHolidayDay: '',
    hourlyRate: contract.hourly_rate,
    hasBonus: false, hasOtherAllowance: false, overtimeRate: 50,
    paymentDay: '25', paymentDirect: false, paymentTransfer: true,
    insuranceEmployment: true, insuranceIndustrial: true,
    insurancePension: false, insuranceHealth: false,
    issueDate: contract.issued_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  }

  // 미리보기용 debounced ContractData (600ms)
  const [previewData, setPreviewData] = useState<ContractData>({
    ...baseData, workerName, workerPhone: workerPhone ?? baseData.workerPhone,
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPreviewData({
        ...baseData,
        workerName,
        workerPhone: workerPhone ?? baseData.workerPhone,
        workerAddress: workerAddress || undefined,
        workerSignatureBase64: signatureBase64 ?? undefined,
      })
    }, 600)
    return () => clearTimeout(debounceRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerAddress, signatureBase64])

  const handleSubmit = async () => {
    if (!workerAddress.trim()) { toast.error('주소를 입력해주세요'); return }
    if (!signatureBase64) { toast.error('서명을 완료해주세요 (서명 저장 버튼을 눌러주세요)'); return }
    setIsSubmitting(true)
    const res = await signContract(contract.id, workerAddress.trim(), signatureBase64)
    setIsSubmitting(false)
    if (res.success) {
      toast.success('서명이 완료됐습니다!')
      onSuccess({
        ...contract,
        worker_address: workerAddress.trim(),
        worker_signed_at: new Date().toISOString(),
      })
    } else {
      toast.error(res.error ?? '서명 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-4">

      <div className="bg-canvas rounded-2xl shadow-xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-hairline shrink-0">
          <div>
            <h2 className="text-[15px] font-bold text-ink">근로계약서 서명</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              {contract.start_date}{contract.end_date ? ` ~ ${contract.end_date}` : ' ~'} · 시급 {contract.hourly_rate.toLocaleString('ko-KR')}원
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 모바일 미리보기 토글 */}
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              className="md:hidden text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-hairline text-ink-muted hover:border-primary-300 hover:text-primary-700 transition-colors bg-transparent cursor-pointer"
            >
              {showPreview ? '서명하기' : 'PDF 미리보기'}
            </button>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-ink-muted hover:bg-canvas-soft transition-colors bg-transparent border-none cursor-pointer text-[16px]">
              ✕
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* PDF 미리보기 패널 */}
          <div className={`flex-1 border-r border-hairline overflow-hidden ${showPreview ? 'flex' : 'hidden'} md:flex flex-col`}>
            <PDFPreviewPanel contractData={previewData} />
          </div>

          {/* 서명 폼 */}
          <div className={`w-full md:w-[320px] shrink-0 overflow-y-auto p-5 space-y-5 ${showPreview ? 'hidden md:block' : 'block'}`}>

            {/* 근로자 정보 확인 */}
            <div className="rounded-xl bg-canvas-soft border border-hairline p-3 space-y-1">
              <p className="text-[11px] font-semibold text-ink-muted mb-1.5">근로자 정보 확인</p>
              <InfoLine label="이름" value={workerName} />
              {workerPhone && <InfoLine label="연락처" value={workerPhone} />}
            </div>

            {/* 주소 입력 */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-ink">
                주소 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={workerAddress}
                onChange={e => setWorkerAddress(e.target.value)}
                placeholder="도로명 주소를 입력하세요"
                className="w-full border border-hairline rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 bg-canvas"
              />
              <p className="text-[10px] text-ink-faint">입력한 주소는 계약서에 기재됩니다.</p>
            </div>

            {/* 서명 패드 */}
            <div className="space-y-1.5">
              <p className="text-[12px] font-semibold text-ink">
                서명 <span className="text-rose-500">*</span>
              </p>
              {signatureBase64 && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold mb-1">
                  <span>✓</span><span>서명 완료</span>
                </div>
              )}
              <SignaturePad
                onSave={setSignatureBase64}
                onClear={() => setSignatureBase64(null)}
              />
            </div>

            {/* 안내문 */}
            <p className="text-[10px] text-ink-faint leading-relaxed">
              전자서명은 근로기준법 제17조에 따라 근로계약 내용을 확인하고 동의함을 의미합니다. 서명 완료 후 PDF가 갱신됩니다.
            </p>

            {/* 제출 버튼 */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !workerAddress.trim() || !signatureBase64}
              className="w-full py-2.5 rounded-xl border-none text-[13px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isSubmitting ? '처리 중...' : '서명 완료'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-[11px] text-ink-faint w-12 shrink-0">{label}</span>
      <span className="text-[11px] text-ink">{value}</span>
    </div>
  )
}
