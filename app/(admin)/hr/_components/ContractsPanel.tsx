'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAllContracts, deleteContract } from '@/app/actions/contracts'
import type { ContractRecord } from '@/app/actions/contracts'
import type { StaffProfile, Store } from '@/types/database'
import { showMsg } from '@/lib/toast'

type ContractFilter = 'all' | 'signed' | 'pending' | 'missing'

const FILTER_LABELS: Record<ContractFilter, string> = {
  all: '전체',
  signed: '서명완료',
  pending: '서명대기',
  missing: '미작성',
}

// contracts가 null이 아닌 빈 배열일 때 매 렌더 새 배열 생성을 막기 위한 안정된 참조
const EMPTY_CONTRACTS: ContractRecord[] = []

interface Props {
  staffList: StaffProfile[]
  stores: Store[]
  refreshSignal: number
  onWriteContract: (staff: StaffProfile) => void
  onChanged: () => void
}

export default function ContractsPanel({ staffList, stores, refreshSignal, onWriteContract, onChanged }: Props) {
  const [filter, setFilter] = useState<ContractFilter>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // react-query 캐시 — 탭 재방문 시 재조회 없이 즉시 표시, 작성·삭제 시그널은 invalidate로 처리
  const queryClient = useQueryClient()
  const contractsQuery = useQuery<ContractRecord[]>({
    queryKey: ['contracts'],
    queryFn: async () => {
      const res = await fetchAllContracts()
      return res.success ? (res.data ?? []) : []
    },
  })
  // contractsQuery.data 자체(참조 안정)에 의존 — 매 렌더 새 배열을 만들면 아래 useMemo가 매번 재계산된다
  const contracts = contractsQuery.isPending ? null : contractsQuery.data ?? EMPTY_CONTRACTS

  useEffect(() => {
    if (refreshSignal > 0) queryClient.invalidateQueries({ queryKey: ['contracts'] })
  }, [refreshSignal, queryClient])

  const staffById = useMemo(() => new Map(staffList.map(s => [s.id, s])), [staffList])
  const storeById = useMemo(() => new Map(stores.map(s => [s.id, s])), [stores])

  // 계약서가 한 건도 없는 재직자 — '미작성' 행으로 노출
  const missingStaff = useMemo(() => {
    const contracted = new Set((contracts ?? []).map(c => c.worker_id))
    return staffList.filter(s => s.status === 'confirmed' && !contracted.has(s.id))
  }, [contracts, staffList])

  const signedCount = (contracts ?? []).filter(c => c.worker_signed_at).length
  const pendingCount = (contracts ?? []).length - signedCount
  const counts: Record<ContractFilter, number> = {
    all: (contracts ?? []).length + missingStaff.length,
    signed: signedCount,
    pending: pendingCount,
    missing: missingStaff.length,
  }

  const visibleContracts = filter === 'missing' ? [] : (contracts ?? []).filter(c =>
    filter === 'all' ? true : filter === 'signed' ? !!c.worker_signed_at : !c.worker_signed_at,
  )
  const showMissing = filter === 'all' || filter === 'missing'

  const affiliationLabel = (staff: StaffProfile | undefined) => {
    if (!staff) return null
    if (staff.staff_role === 'kitchen') return '주방'
    return staff.store_id != null ? (storeById.get(staff.store_id)?.name ?? '매장 미배정') : '매장 미배정'
  }

  const handleDelete = async (c: ContractRecord) => {
    const who = staffById.get(c.worker_id)?.name ?? `#${c.worker_id}`
    if (!confirm(`${who} — "${c.start_date}${c.end_date ? ` ~ ${c.end_date}` : ''}" 계약서를 삭제할까요?\nPDF 파일도 함께 삭제됩니다.`)) return
    setDeletingId(c.id)
    const res = await deleteContract(c.id)
    setDeletingId(null)
    if (res.success) {
      queryClient.setQueryData<ContractRecord[]>(['contracts'], prev => (prev ?? []).filter(x => x.id !== c.id))
      showMsg('계약서가 삭제되었습니다.')
      onChanged()
    } else {
      showMsg(`삭제 실패: ${res.error ?? '알 수 없는 오류'}`)
    }
  }

  return (
    <div className="bg-canvas rounded-2xl border border-hairline shadow-level-1 overflow-hidden">
      {/* 헤더: 필터 칩 */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-hairline bg-canvas-soft">
        <span className="text-[13px] font-bold text-ink mr-1">근로계약서</span>
        <div className="flex flex-wrap rounded-xl overflow-hidden border border-hairline bg-canvas">
          {(Object.keys(FILTER_LABELS) as ContractFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1.5 text-[12px] font-bold border-none cursor-pointer transition whitespace-nowrap ${
                filter === f ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
              }`}
            >
              {FILTER_LABELS[f]}
              <span className={`ml-0.5 ${filter === f ? 'opacity-70' : 'text-ink-faint'}`}>{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        {contracts === null ? (
          <p className="text-ink-faint text-sm p-4 text-center m-0">불러오는 중...</p>
        ) : visibleContracts.length === 0 && (!showMissing || missingStaff.length === 0) ? (
          <p className="text-ink-faint text-sm p-6 text-center m-0">표시할 계약서가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {visibleContracts.map(c => {
              const staff = staffById.get(c.worker_id)
              const aff = affiliationLabel(staff)
              return (
                <div key={c.id} className="flex items-center gap-2 flex-wrap bg-canvas-soft rounded-lg px-3 py-2 border border-hairline">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-ink">{staff?.name ?? `#${c.worker_id}`}</span>
                      {aff && <span className="text-[10px] font-semibold text-violet-600">{aff}</span>}
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
                    <div className="text-[10px] text-ink-muted mt-0.5">
                      {c.start_date}{c.end_date ? ` ~ ${c.end_date}` : ' ~'}
                      {' · '}₩{c.hourly_rate.toLocaleString('ko-KR')}/h
                      {' · '}발급 {new Date(c.issued_at).toLocaleDateString('ko-KR')}
                      {c.worker_signed_at && ` · 서명 ${new Date(c.worker_signed_at).toLocaleDateString('ko-KR')}`}
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
              )
            })}

            {showMissing && missingStaff.length > 0 && (
              <>
                {filter === 'all' && (
                  <p className="m-0 pt-2 pb-1 text-[11px] font-bold text-amber-600">계약서 미작성 재직자</p>
                )}
                {missingStaff.map(s => (
                  <div key={`missing-${s.id}`} className="flex items-center gap-2 flex-wrap bg-canvas rounded-lg px-3 py-2 border border-dashed border-amber-300">
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-ink">{s.name}</span>
                      {affiliationLabel(s) && <span className="text-[10px] font-semibold text-violet-600">{affiliationLabel(s)}</span>}
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        미작성
                      </span>
                    </div>
                    {s.user_profile_id ? (
                      <button
                        onClick={() => onWriteContract(s)}
                        className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer">
                        작성
                      </button>
                    ) : (
                      <span className="shrink-0 text-[10px] text-ink-faint">계정 미연결</span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
