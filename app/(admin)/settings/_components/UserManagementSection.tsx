'use client'

import { useEffect, useMemo, useState } from 'react'
import { bankAccountMatches } from '@/lib/bank'
import { phoneMatches } from '@/lib/phone'
import { toast } from 'sonner'
import { fetchAllUserProfiles, setUserRole, adminDeleteUserAccount, getResidentIdForInsurance, resetWorkerPassword } from '@/app/actions/workers'
import type { UserProfile } from '@/app/actions/workers'
import type { UserAppRole } from '@/types/database'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { formatPhoneNumber } from '@/lib/utils'
import { utcToKstDateStr } from '@/lib/date'
import ConfirmDialog from '@/components/ConfirmDialog'
import CopyText from '@/components/CopyText'

const ROLE_OPTIONS: { value: UserAppRole; label: string }[] = [
  { value: 'admin', label: '관리자' },
  { value: 'manager', label: '매니저' },
  { value: 'user', label: '직원' },
]

function toAppRole(value: string): UserAppRole {
  return value === 'admin' ? 'admin' : value === 'manager' ? 'manager' : 'user'
}

type RoleFilter = UserAppRole | 'all'
type SortKey = 'name' | 'newest' | 'oldest'

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  ...ROLE_OPTIONS,
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: '이름순' },
  { value: 'newest', label: '최근 가입' },
  { value: 'oldest', label: '오래된 가입' },
]

// 정렬은 아무것도 감추지 않는 개인 취향이라 유지한다.
// (권한 필터는 사람을 감추므로 저장하지 않고 항상 '전체'로 시작한다)
const SORT_KEY_STORAGE = 'user_mgmt_sort'

/** 가입일 표기 — 목록이 빽빽해서 26.06.10 형태로 줄인다 (전체 날짜는 title로) */
function signupLabel(createdAt: string | null): string {
  if (!createdAt) return ''
  return utcToKstDateStr(createdAt).slice(2).replace(/-/g, '.')
}

export default function UserManagementSection() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [revealed, setRevealed] = useState<{ id: string; value: string } | null>(null)
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    fetchAllUserProfiles().then(res => {
      if (res.success && res.data) setUsers(res.data)
      setIsLoading(false)
    })
    createSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      setMyUserId(data.user?.id ?? null)
    })
    const saved = localStorage.getItem(SORT_KEY_STORAGE)
    if (saved === 'name' || saved === 'newest' || saved === 'oldest') setSortKey(saved)
  }, [])

  const changeSort = (key: SortKey) => {
    setSortKey(key)
    try { localStorage.setItem(SORT_KEY_STORAGE, key) } catch { /* ignore */ }
  }

  const roleCounts = useMemo(() => ({
    all: users.length,
    admin: users.filter(u => toAppRole(u.worker_role) === 'admin').length,
    manager: users.filter(u => toAppRole(u.worker_role) === 'manager').length,
    user: users.filter(u => toAppRole(u.worker_role) === 'user').length,
  }), [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = users.filter(u => {
      if (roleFilter !== 'all' && toAppRole(u.worker_role) !== roleFilter) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q)
        || phoneMatches(u.phone, q)
        || bankAccountMatches(u.bank_account, q)
        || (u.bank_name ?? '').toLowerCase().includes(q)
    })

    // 이름순은 ko 로케일 비교라 ㄱㄴㄷ 순으로 정렬된다.
    // 가입 시각이 없는 옛 계정은 뒤로 보내고, 같은 시각이면 이름으로 안정 정렬한다.
    const byName = (a: UserProfile, b: UserProfile) => a.name.localeCompare(b.name, 'ko')
    return [...matched].sort((a, b) => {
      if (sortKey === 'name') return byName(a, b)
      if (!a.created_at || !b.created_at) return a.created_at ? -1 : b.created_at ? 1 : byName(a, b)
      const cmp = a.created_at.localeCompare(b.created_at)
      if (cmp === 0) return byName(a, b)
      return sortKey === 'newest' ? -cmp : cmp
    })
  }, [users, query, roleFilter, sortKey])

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

  async function handleReveal(u: UserProfile) {
    if (revealed?.id === u.id) { setRevealed(null); return }
    setRevealingId(u.id)
    const res = await getResidentIdForInsurance(u.id)
    setRevealingId(null)
    if (res.success && res.data) {
      setRevealed({ id: u.id, value: res.data.residentId })
    } else {
      toast.error(res.error ?? '조회 실패')
    }
  }

  async function handleResetConfirm() {
    if (!resetTarget) return
    setIsResetting(true)
    const res = await resetWorkerPassword(resetTarget.id)
    setIsResetting(false)
    if (res.success) {
      toast.success(`${resetTarget.name} 님의 비밀번호가 초기화됐습니다 (전화번호로 로그인 가능)`)
      setResetTarget(null)
    } else {
      toast.error(`초기화 실패: ${res.error}`)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const res = await adminDeleteUserAccount(deleteTarget.id)
    setIsDeleting(false)
    if (res.success) {
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
      toast.success(`${deleteTarget.name} 님을 탈퇴시켰습니다`)
      setDeleteTarget(null)
    } else {
      toast.error(`탈퇴 실패: ${res.error}`)
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

      {/* 권한 필터 + 정렬 */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex rounded-lg overflow-hidden border border-hairline bg-canvas">
          {ROLE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setRoleFilter(f.value)}
              className={`px-2.5 py-1 text-[11px] font-semibold border-none cursor-pointer transition-colors whitespace-nowrap ${
                roleFilter === f.value ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
              }`}
            >
              {f.label}
              <span className={`ml-1 ${roleFilter === f.value ? 'opacity-70' : 'text-ink-faint'}`}>{roleCounts[f.value]}</span>
            </button>
          ))}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-hairline bg-canvas ml-auto">
          {SORT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => changeSort(o.value)}
              className={`px-2.5 py-1 text-[11px] font-semibold border-none cursor-pointer transition-colors whitespace-nowrap ${
                sortKey === o.value ? 'bg-ink text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[11px] text-ink-muted mb-2">
        {filtered.length === users.length ? `총 ${users.length}명` : `${filtered.length} / ${users.length}명`}
      </div>

      <div className="rounded-xl border border-hairline overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-ink-muted text-center py-6">
            {query.trim() ? '검색 결과가 없습니다.' : '이 권한에 해당하는 계정이 없습니다.'}
          </p>
        ) : filtered.map((u, idx) => {
          const role = toAppRole(u.worker_role)
          const isMe = u.id === myUserId
          const isSaving = savingId === u.id

          return (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-soft transition-colors ${idx !== filtered.length - 1 ? 'border-b border-hairline' : ''}`}>

              {/* 이름 */}
              <div className="w-[120px] shrink-0 min-w-0">
                <div className="text-[13px] font-bold text-ink truncate">
                  <CopyText value={u.name} label="이름">{u.name}</CopyText>
                  {isMe && <span className="ml-1.5 text-[10px] font-normal text-ink-faint">(나)</span>}
                </div>
                <div
                  className="text-[10px] text-ink-faint truncate"
                  title={u.created_at ? `가입 ${utcToKstDateStr(u.created_at)}` : undefined}
                >
                  {u.created_at ? `${signupLabel(u.created_at)} 가입` : '가입일 미상'}
                </div>
              </div>

              {/* 전화 + 계좌 */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-[11px] text-ink-muted">
                <span className="truncate">
                  {u.phone
                    ? <CopyText value={formatPhoneNumber(u.phone)} label="전화번호">{formatPhoneNumber(u.phone)}</CopyText>
                    : <span className="text-ink-faint">전화 미등록</span>}
                </span>
                <span className="truncate">
                  {u.bank_account ? (
                    // 은행명까지 함께 보여주되 복사되는 건 계좌번호 숫자만 — 송금 화면에 그대로 붙여넣기
                    <CopyText value={u.bank_account} label="계좌번호" toastValue={u.bank_name ?? undefined}>
                      {u.bank_name ? `${u.bank_name} ${u.bank_account}` : u.bank_account}
                    </CopyText>
                  ) : (
                    <span className="text-ink-faint">계좌 미등록</span>
                  )}
                </span>
              </div>

              {/* 주민등록번호 */}
              <div className="w-[150px] shrink-0 flex items-center gap-1.5">
                {(revealed?.id === u.id || u.resident_reg_no_masked) ? (
                  <span className="text-[11px] text-ink-muted truncate font-mono">
                    <CopyText
                      value={revealed?.id === u.id ? revealed.value : u.resident_reg_no_masked!}
                      label="주민등록번호"
                    >
                      {revealed?.id === u.id ? revealed.value : u.resident_reg_no_masked}
                    </CopyText>
                  </span>
                ) : (
                  <span className="text-[11px] text-ink-faint font-sans">미등록</span>
                )}
                {u.resident_reg_no_masked && (
                  <button
                    onClick={() => handleReveal(u)}
                    disabled={revealingId === u.id}
                    className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border cursor-pointer transition-colors bg-canvas text-ink-faint border-hairline hover:bg-canvas-soft disabled:opacity-50"
                  >
                    {revealingId === u.id ? '…' : revealed?.id === u.id ? '닫기' : '보기'}
                  </button>
                )}
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

              {/* 비번 초기화 */}
              <div className="shrink-0">
                <button
                  onClick={() => setResetTarget(u)}
                  disabled={!u.phone}
                  title={!u.phone ? '전화번호가 등록되어 있지 않아 초기화할 수 없습니다' : '비밀번호를 초기값(전화번호)으로 재설정'}
                  className="text-[10px] font-semibold px-2 py-1 rounded-md border cursor-pointer transition-colors bg-canvas text-ink-muted border-hairline hover:bg-canvas-soft disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-canvas"
                >
                  비번 초기화
                </button>
              </div>

              {/* 탈퇴 */}
              <div className="shrink-0">
                <button
                  onClick={() => setDeleteTarget(u)}
                  disabled={isMe}
                  title={isMe ? '본인 계정은 여기서 탈퇴할 수 없습니다' : '계정 강제 탈퇴'}
                  className="text-[10px] font-semibold px-2 py-1 rounded-md border cursor-pointer transition-colors bg-canvas text-rose-500 border-rose-200 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-canvas"
                >
                  탈퇴
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={resetTarget !== null}
        title={`"${resetTarget?.name}" 님의 비밀번호를 초기화할까요?`}
        description={`비밀번호가 가입 시 초기값(전화번호: ${resetTarget?.phone ?? ''})으로 재설정됩니다.`}
        confirmLabel="초기화"
        danger
        busy={isResetting}
        onConfirm={handleResetConfirm}
        onClose={() => setResetTarget(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`"${deleteTarget?.name}" 님을 강제 탈퇴시키겠습니까?`}
        description="계정이 즉시 삭제되며 복구할 수 없습니다. HR 근무 기록은 유지되지만 계정 연결은 해제됩니다."
        confirmLabel="탈퇴시키기"
        danger
        busy={isDeleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  )
}
