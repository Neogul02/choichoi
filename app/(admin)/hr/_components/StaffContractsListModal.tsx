'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getWorkerContracts, deleteContract } from '@/app/actions/contracts'
import type { ContractRecord } from '@/app/actions/contracts'
import { showMsg } from '@/lib/toast'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

interface Props {
  staffId: number
  name: string
  onClose: () => void
  onChange?: () => void
}

export default function StaffContractsListModal({ staffId, name, onClose, onChange }: Props) {
  useBodyScrollLock()
  const [contracts, setContracts] = useState<ContractRecord[] | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = () => {
    setContracts(null)
    getWorkerContracts(staffId).then(res => setContracts(res.success ? (res.data ?? []) : []))
  }

  useEffect(load, [staffId])

  const handleDelete = async (c: ContractRecord) => {
    if (!confirm(`"${c.start_date}${c.end_date ? ` ~ ${c.end_date}` : ''}" 계약서를 삭제할까요?\nPDF 파일도 함께 삭제됩니다.`)) return
    setDeletingId(c.id)
    const res = await deleteContract(c.id)
    setDeletingId(null)
    if (res.success) {
      setContracts(prev => (prev ?? []).filter(x => x.id !== c.id))
      showMsg('계약서가 삭제되었습니다.')
      onChange?.()
    } else {
      showMsg(`삭제 실패: ${res.error ?? '알 수 없는 오류'}`)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas w-full max-w-[520px] max-h-[85vh] overflow-y-auto rounded-xl shadow-level-2 border border-hairline [scrollbar-width:thin]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-canvas-soft sticky top-0 z-10">
          <div>
            <h3 className="m-0 text-[15px] font-bold text-ink">{name}</h3>
            <p className="m-0 text-[11px] text-ink-muted mt-0.5">근로계약서 목록</p>
          </div>
          <button onClick={onClose} className="bg-transparent border-none text-ink-faint text-[22px] cursor-pointer hover:text-ink transition leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-4">
          {contracts === null ? (
            <div className="flex items-center justify-center py-12 text-[13px] text-ink-muted">불러오는 중...</div>
          ) : contracts.length === 0 ? (
            <p className="text-center text-[12px] text-ink-faint py-8">작성된 근로계약서가 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {contracts.map(c => (
                <div key={c.id} className="flex items-center gap-3 bg-canvas-soft rounded-lg px-3 py-2 border border-hairline">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-ink">
                        {c.start_date}{c.end_date ? ` ~ ${c.end_date}` : ' ~'}
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        ₩{c.hourly_rate.toLocaleString('ko-KR')}/h
                      </span>
                      {c.workplace && (
                        <span className="text-[10px] text-ink-muted truncate">{c.workplace}</span>
                      )}
                      {c.worker_signed_at ? (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          서명완료
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          서명대기
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-ink-faint mt-0.5">
                      발급: {new Date(c.issued_at).toLocaleDateString('ko-KR')}
                      {c.worker_signed_at && ` · 서명: ${new Date(c.worker_signed_at).toLocaleDateString('ko-KR')}`}
                    </div>
                  </div>
                  {c.pdf_signed_url ? (
                    <a href={c.pdf_signed_url} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-colors no-underline">
                      PDF
                    </a>
                  ) : (
                    <span className="shrink-0 text-[10px] px-2.5 py-1 rounded-md bg-canvas text-ink-faint border border-hairline">
                      PDF 없음
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={deletingId === c.id}
                    className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50">
                    {deletingId === c.id ? '...' : '삭제'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
