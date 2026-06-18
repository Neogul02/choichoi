'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { fetchAllUserProfiles, findWorkerByProfileId } from '@/app/actions/workers'
import type { UserProfile } from '@/app/actions/workers'
import { getWorkerContracts, deleteContract } from '@/app/actions/contracts'
import type { ContractRecord } from '@/app/actions/contracts'
import { toast } from 'sonner'

const ContractGenerateModal = dynamic(() => import('@/components/ContractGenerateModal'), { ssr: false })

interface ContractTarget { user: UserProfile; workerId: number }

export default function UserManagementSection() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')

  // 계약서 작성 모달
  const [contractTarget, setContractTarget] = useState<ContractTarget | null>(null)
  const [workerIdCache, setWorkerIdCache] = useState<Record<string, number>>({})
  const [loadingWorkerFor, setLoadingWorkerFor] = useState<string | null>(null)

  // 계약서 목록 패널
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({})
  const [contractsCache, setContractsCache] = useState<Record<string, ContractRecord[]>>({})
  const [loadingContractsList, setLoadingContractsList] = useState<Record<string, boolean>>({})
  const [deletingContractId, setDeletingContractId] = useState<string | null>(null)

  useEffect(() => {
    fetchAllUserProfiles().then(res => {
      if (res.success && res.data) setUsers(res.data)
      setIsLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.phone ?? '').includes(q) ||
      (u.bank_account ?? '').includes(q) ||
      (u.bank_name ?? '').toLowerCase().includes(q)
    )
  }, [users, query])

  // worker ID 보장 (캐시 우선)
  const resolveWorkerId = async (userId: string): Promise<number | null> => {
    if (workerIdCache[userId]) return workerIdCache[userId]
    setLoadingWorkerFor(userId)
    const res = await findWorkerByProfileId(userId)
    setLoadingWorkerFor(null)
    if (res.success && res.data) {
      setWorkerIdCache(p => ({ ...p, [userId]: res.data!.id }))
      return res.data.id
    }
    return null
  }

  // 계약서 작성 모달 열기
  const handleOpenModal = async (user: UserProfile) => {
    const wid = await resolveWorkerId(user.id)
    if (wid) setContractTarget({ user, workerId: wid })
    else toast.error('연결된 Worker가 없습니다. 일정 탭에서 팝업에 먼저 등록하세요.')
  }

  const handleDeleteContract = async (userId: string, contractId: string, label: string) => {
    if (!confirm(`"${label}" 계약서를 삭제할까요?\nPDF 파일도 함께 삭제됩니다.`)) return
    setDeletingContractId(contractId)
    const res = await deleteContract(contractId)
    setDeletingContractId(null)
    if (res.success) {
      setContractsCache(p => ({ ...p, [userId]: (p[userId] ?? []).filter(c => c.id !== contractId) }))
      toast.success('계약서가 삭제되었습니다.')
    } else {
      toast.error('삭제 실패: ' + (res.error ?? '알 수 없는 오류'))
    }
  }

  // 계약서 목록 토글
  const handleToggleContracts = async (userId: string) => {
    const isOpen = expandedContracts[userId]
    setExpandedContracts(p => ({ ...p, [userId]: !isOpen }))
    if (!isOpen && contractsCache[userId] === undefined) {
      const wid = await resolveWorkerId(userId)
      if (!wid) { setContractsCache(p => ({ ...p, [userId]: [] })); return }
      setLoadingContractsList(p => ({ ...p, [userId]: true }))
      const res = await getWorkerContracts(wid)
      setLoadingContractsList(p => ({ ...p, [userId]: false }))
      setContractsCache(p => ({ ...p, [userId]: res.success ? (res.data ?? []) : [] }))
      if (!res.success) toast.error('계약서 목록 조회 실패')
    }
  }

  if (isLoading) return <p className="text-ink-muted text-sm">불러오는 중...</p>
  if (users.length === 0) return <p className="text-ink-muted text-sm">등록된 직원이 없습니다.</p>

  return (
    <>
      {/* 검색 */}
      <div className="relative mb-3">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="이름, 전화번호, 계좌 검색..."
          className="w-full pl-8 pr-8 py-1.5 border border-hairline rounded-lg text-[12px] focus:outline-none focus:border-primary-700 bg-canvas"
        />
        {query && (
          <button onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs bg-transparent border-none cursor-pointer">
            ✕
          </button>
        )}
      </div>

      <div className="text-[11px] text-ink-muted mb-2">
        {query ? `${filtered.length} / ${users.length}명` : `총 ${users.length}명`}
      </div>

      <div className="rounded-xl border border-hairline overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-ink-muted text-center py-6">검색 결과가 없습니다.</p>
        ) : filtered.map((u, idx) => {
          const isAdmin = u.worker_role === 'admin'
          const isWorkerLoading = loadingWorkerFor === u.id
          const isExpanded = expandedContracts[u.id] ?? false
          const contracts = contractsCache[u.id]
          const isContractsLoading = loadingContractsList[u.id] ?? false

          return (
            <div key={u.id} className={idx !== filtered.length - 1 ? 'border-b border-hairline' : ''}>
              {/* 유저 행 */}
              <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-soft transition-colors">

                {/* 이름 + 역할 */}
                <div className="w-[120px] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-ink truncate">{u.name}</span>
                    <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
                      isAdmin ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-canvas text-ink-faint border-hairline'
                    }`}>
                      {isAdmin ? '관리자' : '직원'}
                    </span>
                  </div>
                </div>

                {/* 전화 + 계좌 */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[11px] text-ink-muted truncate">
                    {u.phone ?? <span className="text-ink-faint">전화 미등록</span>}
                  </span>
                  <span className="text-[11px] text-ink-muted truncate">
                    {u.bank_name && u.bank_account
                      ? `${u.bank_name} ${u.bank_account}`
                      : <span className="text-ink-faint">계좌 미등록</span>}
                  </span>
                </div>

                {/* 액션 버튼들 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.health_cert_url ? (
                    <a href={u.health_cert_url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-semibold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors no-underline">
                      보건증
                    </a>
                  ) : (
                    <span className="text-[10px] px-2 py-1 rounded-md bg-canvas text-ink-faint border border-hairline">
                      보건증 x
                    </span>
                  )}

                  {/* 계약서 작성 */}
                  <button onClick={() => handleOpenModal(u)} disabled={isWorkerLoading}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50">
                    {isWorkerLoading ? '...' : '근로계약서'}
                  </button>

                  {/* 계약서 목록 토글 */}
                  <button
                    onClick={() => handleToggleContracts(u.id)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                      isExpanded
                        ? 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                        : 'bg-canvas text-ink-muted border-hairline hover:bg-canvas-soft'
                    }`}>
                    계약서 {isExpanded ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* 계약서 목록 패널 */}
              {isExpanded && (
                <div className="border-t border-hairline bg-canvas-soft px-4 py-3">
                  {isContractsLoading ? (
                    <p className="text-[11px] text-ink-muted">조회 중...</p>
                  ) : !contracts || contracts.length === 0 ? (
                    <p className="text-[11px] text-ink-faint">작성된 근로계약서가 없습니다.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {contracts.map(c => (
                        <div key={c.id} className="flex items-center gap-3 bg-canvas rounded-lg px-3 py-2 border border-hairline">
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
                            onClick={() => handleDeleteContract(u.id, c.id, `${c.start_date}${c.end_date ? ` ~ ${c.end_date}` : ''}`)}
                            disabled={deletingContractId === c.id}
                            className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50">
                            {deletingContractId === c.id ? '...' : '삭제'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {contractTarget && (
        <ContractGenerateModal
          user={contractTarget.user}
          workerId={contractTarget.workerId}
          onClose={() => setContractTarget(null)}
          onSuccess={() => {
            // 계약서 생성 후 캐시 무효화 → 다음 열 때 재조회
            setContractsCache(p => { const n = { ...p }; delete n[contractTarget.user.id]; return n })
            setContractTarget(null)
          }}
        />
      )}
    </>
  )
}
