'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { fetchAllUserProfiles, setUserRole } from '@/app/actions/workers'
import type { UserProfile } from '@/app/actions/workers'
import type { UserAppRole } from '@/types/database'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

const ROLE_OPTIONS: { value: UserAppRole; label: string }[] = [
  { value: 'admin', label: '관리자' },
  { value: 'manager', label: '매니저' },
  { value: 'user', label: '직원' },
]

function toAppRole(value: string): UserAppRole {
  return value === 'admin' ? 'admin' : value === 'manager' ? 'manager' : 'user'
}

export default function UserManagementSection() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    fetchAllUserProfiles().then(res => {
      if (res.success && res.data) setUsers(res.data)
      setIsLoading(false)
    })
    createSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      setMyUserId(data.user?.id ?? null)
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

  async function handleRoleChange(userId: string, role: UserAppRole) {
    setSavingId(userId)
    const res = await setUserRole(userId, role)
    setSavingId(null)
    if (res.success) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, worker_role: role } : u))
      toast.success('권한이 변경됐습니다')
    } else {
      toast.error(`권한 변경 실패: ${res.error}`)
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
          const role = toAppRole(u.worker_role)
          const isMe = u.id === myUserId
          const isSaving = savingId === u.id

          return (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-soft transition-colors ${idx !== filtered.length - 1 ? 'border-b border-hairline' : ''}`}>

              {/* 이름 */}
              <div className="w-[120px] shrink-0">
                <span className="text-[13px] font-bold text-ink truncate">{u.name}</span>
                {isMe && <span className="ml-1.5 text-[10px] text-ink-faint">(나)</span>}
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

              {/* 권한 선택 */}
              <div className="flex gap-1 shrink-0" title={isMe ? '본인 권한은 여기서 바꿀 수 없습니다' : undefined}>
                {ROLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleRoleChange(u.id, opt.value)}
                    disabled={isMe || isSaving || role === opt.value}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-md border cursor-pointer transition-colors disabled:cursor-not-allowed ${
                      role === opt.value
                        ? 'bg-primary-700 text-white border-primary-700'
                        : 'bg-canvas text-ink-faint border-hairline hover:bg-canvas-soft'
                    } ${isMe && role !== opt.value ? 'opacity-40' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
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
