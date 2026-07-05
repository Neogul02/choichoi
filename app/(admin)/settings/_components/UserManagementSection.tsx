'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchAllUserProfiles } from '@/app/actions/workers'
import type { UserProfile } from '@/app/actions/workers'

export default function UserManagementSection() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')

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

          return (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-soft transition-colors ${idx !== filtered.length - 1 ? 'border-b border-hairline' : ''}`}>

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

              {/* 보건증 */}
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
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
