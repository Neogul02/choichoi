'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { getWorkerTier } from '@/lib/tiers'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import NavBar from '@/components/NavBar'
import { getMyProfile, getMyOrderStats, updateMyProfile, changeMyPassword, deleteMyAccount } from '@/app/actions/workers'
import { getMyContracts } from '@/app/actions/contracts'
import { getMyRoster, type MyShift } from '@/app/actions/roster'
import { formatPrice } from '@/lib/utils'
import type { UserProfile, MyOrderStats, PopupOrderStat } from '@/app/actions/workers'
import type { ContractRecord } from '@/app/actions/contracts'
import dynamic from 'next/dynamic'

const WorkerSignModal = dynamic(() => import('@/components/WorkerSignModal'), { ssr: false })
// recharts(무거운 차트 라이브러리)를 본 번들에서 분리 — 차트가 보이는 경우에만 로드
const DailyRevenueChart = dynamic(() => import('./_components/DailyRevenueChart'), {
  ssr: false,
  loading: () => <div className='h-[180px] rounded-xl bg-canvas-soft animate-pulse' />,
})

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function hhmm(t: string) { return t.slice(0, 5) }

// 서버 컴포넌트(page.tsx)가 프리페치한 초기 데이터 — null이면 기존 클라이언트 조회로 폴백
export interface InitialMyData {
  profile: UserProfile | null
  stats: MyOrderStats | null
  contracts: ContractRecord[]
  shifts: MyShift[] | null
}

export default function MyPageClient({ initial }: { initial: InitialMyData | null }) {
  const [profile, setProfile] = useState<UserProfile | null>(initial?.profile ?? null)
  const [authName, setAuthName] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(initial?.profile?.worker_role === 'admin')
  const [stats, setStats] = useState<MyOrderStats | null>(initial?.stats ?? null)
  const [activePopupIdx, setActivePopupIdx] = useState(() => Math.max(0, (initial?.stats?.byPopup.length ?? 1) - 1))
  const [loading, setLoading] = useState(initial == null)
  const [myShifts, setMyShifts] = useState<MyShift[] | null>(initial?.shifts ?? null)

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editBankName, setEditBankName] = useState('')
  const [editBankAccount, setEditBankAccount] = useState('')
  const [editHealthCert, setEditHealthCert] = useState<File | null>(null)
  const [isEditPending, startEditTransition] = useTransition()
  const editFileRef = useRef<HTMLInputElement>(null)

  const [isPwOpen, setIsPwOpen] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [isPwPending, startPwTransition] = useTransition()

  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isDeletePending, startDeleteTransition] = useTransition()

  const [contracts, setContracts] = useState<ContractRecord[]>(initial?.contracts ?? [])
  const [signingContract, setSigningContract] = useState<ContractRecord | null>(null)

  useEffect(() => {
    const load = async () => {
      // getSession()은 로컬 쿠키 판독 — getUser()의 인증 서버 왕복을 제거
      const supabase = createSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (user) {
        setAuthName(user.user_metadata?.name ?? null)
        setAuthEmail(user.email ?? null)
        // 프리페치된 profile.worker_role이 우선 — 없을 때만 메타데이터로 판정
        if (initial?.profile == null) setIsAdmin(user.user_metadata?.role === 'admin')
      }
      if (initial != null) return // 서버 프리페치 성공 시 마운트 조회 생략
      const [profileRes, statsRes, contractsRes, rosterRes] = await Promise.all([
        getMyProfile(),
        getMyOrderStats(),
        getMyContracts(),
        getMyRoster(),
      ])
      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data)
        setIsAdmin(profileRes.data.worker_role === 'admin')
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data)
        setActivePopupIdx(Math.max(0, (statsRes.data.byPopup.length ?? 1) - 1))
      }
      if (contractsRes.success && contractsRes.data) {
        setContracts(contractsRes.data)
      }
      if (rosterRes.success && rosterRes.data) {
        setMyShifts(rosterRes.data.shifts)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = todayStr()
  const nextShift = useMemo(
    () => myShifts?.find(s => s.work_date >= today) ?? null,
    [myShifts, today],
  )
  const monthSummary = useMemo(() => {
    if (!myShifts) return null
    const prefix = today.slice(0, 7)
    const inMonth = myShifts.filter(s => s.work_date.startsWith(prefix))
    if (inMonth.length === 0) return { days: 0, hours: 0 }
    const days = new Set(inMonth.map(s => s.work_date)).size
    const hours = Math.round(inMonth.reduce((sum, s) => sum + s.hours, 0) * 10) / 10
    return { days, hours }
  }, [myShifts, today])

  const unsignedContracts = contracts.filter(c => !c.worker_signed_at)

  const missingItems = useMemo(() => {
    if (!profile) return []
    const items: string[] = []
    if (!profile.phone) items.push('전화번호')
    if (!profile.bank_name || !profile.bank_account) items.push('계좌')
    if (!profile.health_cert_url) items.push('보건증')
    return items
  }, [profile])

  const startEdit = () => {
    setEditName(profile?.name ?? authName ?? '')
    setEditEmail(authEmail ?? '')
    setEditPhone(profile?.phone ?? '')
    setEditBankName(profile?.bank_name ?? '')
    setEditBankAccount(profile?.bank_account ?? '')
    setEditHealthCert(null)
    setIsEditing(true)
  }

  const handleSaveProfile = () => {
    startEditTransition(async () => {
      const supabase = createSupabaseBrowserClient()
      let healthCertUrl: string | undefined
      if (editHealthCert) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const ext = editHealthCert.name.split('.').pop()
          const path = `${user.id}/health_cert.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('health-certs')
            .upload(path, editHealthCert, { upsert: true })
          if (uploadError) {
            toast.error('보건증 업로드 실패: ' + uploadError.message)
            return
          }
          const { data: urlData } = supabase.storage.from('health-certs').getPublicUrl(path)
          healthCertUrl = urlData.publicUrl
        }
      }

      const res = await updateMyProfile({
        email: editEmail.trim() || undefined,
        name: editName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        bankName: editBankName.trim() || undefined,
        bankAccount: editBankAccount.trim() || undefined,
        healthCertUrl,
      })

      if (res.success) {
        toast.success('프로필이 저장됐습니다.')
        setIsEditing(false)
        if (editEmail.trim() && editEmail.trim() !== authEmail) setAuthEmail(editEmail.trim())
        const profileRes = await getMyProfile()
        if (profileRes.success && profileRes.data) setProfile(profileRes.data)
      } else {
        toast.error(res.error ?? '저장 실패')
      }
    })
  }

  if (loading) {
    return (
      <>
        <NavBar />
        <main className='min-h-screen flex items-center justify-center'>
          <p className='text-ink-faint text-sm'>불러오는 중...</p>
        </main>
      </>
    )
  }

  const displayName = profile?.name ?? authName ?? '—'
  const displayEmail = authEmail ?? '—'
  const inputClass =
    'w-full border border-hairline rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 bg-canvas'

  const activePopup: PopupOrderStat | undefined = stats?.byPopup[activePopupIdx]

  return (
    <>
      <NavBar />
      <main className='min-h-screen p-4 pb-10'>
        <div className='max-w-[560px] mx-auto space-y-4'>

          <h1 className='m-0 text-[19px] font-extrabold text-ink'>MY</h1>

          {/* 서명 대기 계약서 알림 */}
          {unsignedContracts.length > 0 && (
            <div className='rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3'>
              <div className='flex-1 min-w-0'>
                <p className='m-0 text-[14px] font-bold text-amber-800'>서명 대기 중인 근로계약서 {unsignedContracts.length}건</p>
                <p className='m-0 mt-0.5 text-[12px] text-amber-700'>계약서를 확인하고 전자서명을 완료해 주세요.</p>
              </div>
              <button
                type='button'
                onClick={() => setSigningContract(unsignedContracts[0])}
                className='shrink-0 px-3.5 py-2 rounded-xl bg-amber-500 text-white text-[13px] font-bold border-none cursor-pointer hover:bg-amber-600 transition'
              >
                서명하기
              </button>
            </div>
          )}

          {/* 프로필 히어로 카드 */}
          <div className='rounded-2xl bg-primary-700 text-white p-5 shadow-level-1'>
            <div className='flex items-center gap-3.5'>
              <div className='w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-[24px] font-extrabold shrink-0'>
                {displayName.charAt(0)}
              </div>
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <p className='m-0 text-[19px] font-extrabold leading-tight'>{displayName}</p>
                  {isAdmin && (
                    <span className='text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/15'>관리자</span>
                  )}
                </div>
                <p className='m-0 mt-0.5 text-[13px] opacity-70 truncate'>{displayEmail}</p>
              </div>
            </div>
          </div>

          {/* 다음 근무 미리보기 → 근무 일정 바로가기 */}
          {myShifts !== null && (
            <Link
              href='/my/schedule'
              className='block rounded-2xl bg-canvas border border-hairline shadow-level-1 p-4 no-underline hover:border-primary-200 transition'
            >
              <div className='flex items-center gap-3'>
                <div className='flex-1 min-w-0'>
                  <p className='m-0 text-[12px] font-bold text-ink-muted'>다음 근무</p>
                  {nextShift ? (() => {
                    const d = new Date(nextShift.work_date + 'T00:00:00')
                    return (
                      <p className='m-0 mt-1 text-[16px] font-extrabold text-ink'>
                        {d.getMonth() + 1}월 {d.getDate()}일 ({DAY_NAMES[d.getDay()]}) {hhmm(nextShift.start_time)} ~ {hhmm(nextShift.end_time)}
                      </p>
                    )
                  })() : (
                    <p className='m-0 mt-1 text-[15px] font-bold text-ink-muted'>예정된 근무가 없습니다</p>
                  )}
                  {monthSummary && monthSummary.days > 0 && (
                    <p className='m-0 mt-1 text-[13px] text-ink-muted'>
                      이번 달 근무 <span className='font-bold text-primary-700'>{monthSummary.days}일</span> · <span className='font-bold text-primary-700'>{monthSummary.hours}시간</span>
                    </p>
                  )}
                </div>
                <span className='shrink-0 text-[13px] font-bold text-primary-700'>일정 보기 ›</span>
              </div>
            </Link>
          )}

          {/* 티어 */}
          {profile && (() => {
            const rev = stats?.totalRevenue ?? profile.total_revenue ?? 0
            const { current, next } = getWorkerTier(rev)
            const progress = next
              ? Math.min(100, ((rev - current.threshold) / (next.threshold - current.threshold)) * 100)
              : 100
            return (
              <section className='rounded-2xl p-5 shadow-level-1 overflow-hidden' style={{ background: current.bg, boxShadow: current.shadow }}>
                <div className='flex items-center justify-between mb-3'>
                  <div>
                    <p className='m-0 text-[12px] font-semibold mb-0.5' style={{ color: current.mute }}>내 판매 티어</p>
                    <p className='m-0 text-[24px] font-black' style={{ color: current.labelText }}>{current.name}</p>
                  </div>
                  <div className='text-right'>
                    <p className='m-0 text-[12px]' style={{ color: current.mute }}>누적 판매량</p>
                    <p className='m-0 text-[18px] font-bold' style={{ color: current.accent }}>{formatPrice(rev)}</p>
                  </div>
                </div>
                {next && (
                  <>
                    <div className='w-full rounded-full h-2 mb-1.5' style={{ background: 'rgba(255,255,255,0.2)' }}>
                      <div className='h-2 rounded-full transition-all' style={{ width: `${progress}%`, background: current.accent }} />
                    </div>
                    <p className='m-0 text-[12px]' style={{ color: current.mute }}>
                      다음 티어 {next.ko}까지 {formatPrice(next.threshold - rev)} 남음
                    </p>
                  </>
                )}
              </section>
            )
          })()}

          {/* 판매 통계 */}
          {stats && (
            <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
              <div className='flex items-center justify-between mb-3'>
                <h2 className='m-0 text-[16px] font-bold text-ink'>내 판매 통계</h2>
                {stats.totalOrders > 0 && (
                  <span className='text-[12px] text-ink-muted'>
                    전체 {stats.totalOrders}건 · {formatPrice(stats.totalRevenue)}
                  </span>
                )}
              </div>

              {stats.totalOrders === 0 ? (
                <p className='m-0 text-ink-muted text-[14px]'>아직 처리한 주문이 없습니다.</p>
              ) : (
                <>
                  {/* 팝업 탭 */}
                  {stats.byPopup.length > 1 && (
                    <div className='flex gap-1.5 mb-4 flex-wrap'>
                      {stats.byPopup.map((p, i) => (
                        <button
                          key={p.popupId}
                          type='button'
                          onClick={() => setActivePopupIdx(i)}
                          className={`text-[13px] px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-semibold ${
                            activePopupIdx === i
                              ? 'bg-primary-700 text-white border-primary-700'
                              : 'bg-canvas-soft text-ink-muted border-hairline hover:border-primary-300 hover:text-primary-700'
                          }`}
                        >
                          {p.popupName}
                        </button>
                      ))}
                    </div>
                  )}

                  {activePopup && <PopupStats popup={activePopup} />}
                </>
              )}
            </section>
          )}

          {/* 내 정보 */}
          <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='m-0 text-[16px] font-bold text-ink'>내 정보</h2>
              {!isEditing && (
                <button type='button' onClick={startEdit}
                  className='text-[13px] px-3 py-1.5 rounded-xl border border-hairline text-ink-muted hover:text-primary-700 hover:border-primary-300 transition-colors bg-transparent cursor-pointer font-semibold'>
                  수정
                </button>
              )}
            </div>

            {isEditing ? (
              <div className='space-y-2.5'>
                <input type='text' value={editName} onChange={(e) => setEditName(e.target.value)} placeholder='이름' className={inputClass} />
                <input type='email' value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder='이메일' className={inputClass} />
                <input type='tel' value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder='전화번호' className={inputClass} />
                <input type='text' value={editBankName} onChange={(e) => setEditBankName(e.target.value)} placeholder='은행명' className={inputClass} />
                <input type='text' value={editBankAccount} onChange={(e) => setEditBankAccount(e.target.value)} placeholder='계좌번호' className={inputClass} />
                <button type='button' onClick={() => editFileRef.current?.click()}
                  className='w-full border border-dashed border-hairline rounded-xl px-3 py-2.5 text-[14px] text-ink-muted hover:border-primary-700 hover:text-primary-700 transition-colors bg-transparent cursor-pointer'>
                  {editHealthCert ? `보건증: ${editHealthCert.name}` : '보건증 사본 교체 (선택)'}
                </button>
                <input ref={editFileRef} type='file' accept='image/*,application/pdf' className='hidden'
                  onChange={(e) => setEditHealthCert(e.target.files?.[0] ?? null)} />
                <div className='flex gap-2 pt-1'>
                  <button type='button' onClick={handleSaveProfile} disabled={isEditPending}
                    className='flex-1 border-none rounded-xl px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'>
                    {isEditPending ? '저장 중...' : '저장'}
                  </button>
                  <button type='button' onClick={() => setIsEditing(false)} disabled={isEditPending}
                    className='flex-1 border border-hairline rounded-xl px-3 py-2.5 text-[14px] text-ink-muted hover:bg-canvas-soft transition-colors bg-transparent cursor-pointer disabled:opacity-60'>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className='space-y-2.5'>
                {missingItems.length > 0 && (
                  <div className='rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-1'>
                    <p className='m-0 text-[13px] text-amber-800'>
                      <span className='font-bold'>{missingItems.join(' · ')}</span>가 아직 등록되지 않았습니다.
                      {missingItems.includes('계좌') ? ' 급여 지급을 위해 등록해 주세요.' : ''}
                    </p>
                  </div>
                )}
                <InfoRow label='이름' value={displayName} />
                <InfoRow label='이메일' value={displayEmail} />
                {profile ? (
                  <>
                    <InfoRow label='전화번호' value={profile.phone ?? '미등록'} />
                    <InfoRow
                      label='계좌'
                      value={profile.bank_name && profile.bank_account
                        ? `${profile.bank_name} ${profile.bank_account}`
                        : profile.bank_account ?? '미등록'}
                    />
                    <InfoRow
                      label='보건증'
                      value={profile.health_cert_url
                        ? <a href={profile.health_cert_url} target='_blank' rel='noopener noreferrer' className='text-primary-700 underline text-[14px]'>보기</a>
                        : '미등록'}
                    />
                  </>
                ) : (
                  <p className='m-0 text-[13px] text-ink-muted'>직원 프로필이 연결되지 않았습니다.{isAdmin ? ' (관리자 계정)' : ''}</p>
                )}
              </div>
            )}
          </section>

          {/* 내 근로계약서 */}
          <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
            <h2 className='m-0 mb-3 text-[16px] font-bold text-ink'>
              내 근로계약서
              {contracts.length > 0 && (
                <span className='ml-1.5 text-[13px] font-semibold text-ink-faint'>{contracts.length}건</span>
              )}
            </h2>
            {contracts.length === 0 ? (
              <p className='m-0 text-[14px] text-ink-muted'>계약서가 없습니다.</p>
            ) : (
              <div className='space-y-2'>
                {contracts.map((c) => (
                  <div key={c.id} className='flex items-start justify-between gap-3 rounded-xl border border-hairline p-3 bg-canvas-soft'>
                    <div className='text-[13px] space-y-0.5 flex-1 min-w-0'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <p className='m-0 text-ink font-bold'>
                          {c.start_date}{c.end_date ? ` ~ ${c.end_date}` : ' ~'}
                        </p>
                        {c.worker_signed_at ? (
                          <span className='text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200'>
                            서명 완료
                          </span>
                        ) : (
                          <span className='text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200'>
                            서명 대기
                          </span>
                        )}
                      </div>
                      <p className='m-0 text-ink-muted'>
                        시급 {c.hourly_rate.toLocaleString('ko-KR')}원
                        {c.workplace ? ` · ${c.workplace}` : ''}
                      </p>
                      <p className='m-0 text-ink-faint text-[12px]'>
                        발급: {c.issued_at.slice(0, 10)}
                        {c.worker_signed_at && ` · 서명: ${c.worker_signed_at.slice(0, 10)}`}
                      </p>
                    </div>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      {c.pdf_signed_url && (
                        <a
                          href={c.pdf_signed_url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-primary-50 text-primary-700 border border-primary-200 text-[12px] font-bold hover:bg-primary-100 transition-colors no-underline'
                        >
                          PDF
                        </a>
                      )}
                      {!c.worker_signed_at && (
                        <button
                          type='button'
                          onClick={() => setSigningContract(c)}
                          className='px-3 py-2 rounded-xl bg-amber-500 text-white border-none text-[12px] font-bold hover:bg-amber-600 transition-colors cursor-pointer'
                        >
                          서명하기
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 비밀번호 변경 */}
          <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
            <div className='flex items-center justify-between'>
              <h2 className='m-0 text-[16px] font-bold text-ink'>비밀번호 변경</h2>
              {!isPwOpen && (
                <button type='button' onClick={() => setIsPwOpen(true)}
                  className='text-[13px] px-3 py-1.5 rounded-xl border border-hairline text-ink-muted hover:text-primary-700 hover:border-primary-300 transition-colors bg-transparent cursor-pointer font-semibold'>
                  변경
                </button>
              )}
            </div>
            {isPwOpen && (
              <div className='space-y-2.5 mt-4'>
                <input type='password' value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder='현재 비밀번호' className={inputClass} />
                <input type='password' value={newPw} onChange={e => setNewPw(e.target.value)} placeholder='새 비밀번호' className={inputClass} />
                <input type='password' value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} placeholder='새 비밀번호 확인' className={inputClass} />
                <div className='flex gap-2 pt-1'>
                  <button type='button' disabled={isPwPending}
                    onClick={() => startPwTransition(async () => {
                      if (newPw !== newPwConfirm) { toast.error('새 비밀번호가 일치하지 않습니다.'); return }
                      const res = await changeMyPassword(currentPw, newPw)
                      if (res.success) { toast.success('비밀번호가 변경됐습니다.'); setIsPwOpen(false); setCurrentPw(''); setNewPw(''); setNewPwConfirm('') }
                      else toast.error(res.error ?? '변경 실패')
                    })}
                    className='flex-1 border-none rounded-xl px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60'>
                    {isPwPending ? '변경 중...' : '저장'}
                  </button>
                  <button type='button' onClick={() => { setIsPwOpen(false); setCurrentPw(''); setNewPw(''); setNewPwConfirm('') }}
                    className='flex-1 border border-hairline rounded-xl px-3 py-2.5 text-[14px] text-ink-muted hover:bg-canvas-soft transition-colors bg-transparent cursor-pointer'>
                    취소
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 계정 탈퇴 — 맨 아래 작은 링크, 누르면 확인 폼 펼침 */}
          <div className='pt-4'>
            {!showDelete ? (
              <div className='text-center'>
                <button
                  type='button'
                  onClick={() => setShowDelete(true)}
                  className='text-[12px] text-ink-faint bg-transparent border-none cursor-pointer underline hover:text-rose-500 transition-colors'
                >
                  계정 탈퇴
                </button>
              </div>
            ) : (
              <div className='rounded-2xl border border-rose-200 bg-rose-50/50 p-4'>
                <p className='m-0 mb-2.5 text-[13px] text-ink-muted'>탈퇴하면 모든 프로필 정보가 삭제되며 복구할 수 없습니다.</p>
                <input type='text' value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder='"탈퇴합니다" 를 입력하세요'
                  className='w-full border border-rose-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-rose-400 bg-canvas mb-2' />
                <div className='flex gap-2'>
                  <button type='button' onClick={() => { setShowDelete(false); setDeleteConfirm('') }}
                    className='flex-1 border border-hairline rounded-xl px-3 py-2.5 text-[14px] text-ink-muted hover:bg-canvas-soft transition-colors bg-canvas cursor-pointer'>
                    취소
                  </button>
                  <button type='button' disabled={deleteConfirm !== '탈퇴합니다' || isDeletePending}
                    onClick={() => startDeleteTransition(async () => {
                      const res = await deleteMyAccount()
                      if (res.success) { toast.success('탈퇴 처리됐습니다.'); window.location.href = '/' }
                      else toast.error(res.error ?? '탈퇴 실패')
                    })}
                    className='flex-1 border-none rounded-xl px-3 py-2.5 text-[14px] font-bold bg-rose-500 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'>
                    {isDeletePending ? '처리 중...' : '탈퇴하기'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 근로계약서 서명 모달 */}
          {signingContract && (
            <WorkerSignModal
              contract={signingContract}
              workerName={profile?.name ?? authName ?? ''}
              workerPhone={profile?.phone ?? undefined}
              onClose={() => setSigningContract(null)}
              onSuccess={(updated) => {
                setContracts(prev => prev.map(c => c.id === updated.id ? updated : c))
                setSigningContract(null)
              }}
            />
          )}

        </div>
      </main>
    </>
  )
}

function PopupStats({ popup }: { popup: PopupOrderStat }) {
  return (
    <div>
      {/* 요약 카드 */}
      <div className='grid grid-cols-2 gap-3 mb-4'>
        <div className='bg-canvas-soft rounded-xl p-4'>
          <p className='m-0 text-[12px] text-ink-muted mb-1'>총 주문</p>
          <p className='m-0 text-[22px] font-black text-ink'>
            {popup.orders.toLocaleString()}
            <span className='text-[13px] font-normal text-ink-muted ml-1'>건</span>
          </p>
        </div>
        <div className='bg-canvas-soft rounded-xl p-4'>
          <p className='m-0 text-[12px] text-ink-muted mb-1'>총 매출</p>
          <p className='m-0 text-[22px] font-black text-ink'>{formatPrice(popup.revenue)}</p>
        </div>
      </div>

      {/* 일별 매출 차트 */}
      {popup.daily.length > 1 && (
        <div className='mb-4'>
          <p className='m-0 text-[13px] text-ink-muted mb-3'>일별 매출</p>
          <DailyRevenueChart daily={popup.daily} formatPrice={formatPrice} />
        </div>
      )}

      {/* 일별 표 */}
      <div>
        <p className='m-0 text-[13px] text-ink-muted mb-2'>일별 상세</p>
        <div className='overflow-hidden rounded-xl border border-hairline'>
          <table className='w-full text-[13px]'>
            <thead>
              <tr className='bg-canvas-soft border-b border-hairline'>
                <th className='text-left px-3 py-2 text-ink-muted font-medium'>날짜</th>
                <th className='text-right px-3 py-2 text-ink-muted font-medium'>주문</th>
                <th className='text-right px-3 py-2 text-ink-muted font-medium'>매출</th>
              </tr>
            </thead>
            <tbody>
              {[...popup.daily].reverse().map((row, i) => (
                <tr key={row.date} className={i % 2 === 0 ? '' : 'bg-canvas-soft/50'}>
                  <td className='px-3 py-2 text-ink'>{row.date}</td>
                  <td className='px-3 py-2 text-right text-ink-muted'>{row.orders}건</td>
                  <td className='px-3 py-2 text-right font-medium text-ink'>{formatPrice(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center gap-3'>
      <span className='text-[13px] text-ink-muted w-16 shrink-0'>{label}</span>
      <span className='text-[14px] text-ink'>{value}</span>
    </div>
  )
}
