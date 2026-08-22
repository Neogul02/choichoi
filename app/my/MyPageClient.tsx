'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { getWorkerTier } from '@/lib/tiers'
import { DAY_NAMES } from '@/lib/staffing'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import NavBar from '@/components/NavBar'
import {
  getMyProfile, getMyOrderStats, updateMyProfile, changeMyPassword, deleteMyAccount, setMyResidentId,
  getUserProfileAsAdmin, getOrderStatsAsAdmin, fetchAllUserProfiles,
} from '@/app/actions/workers'
import { isValidResidentRegistrationNumber } from '@/lib/resident-id'
import { formatPhoneInput } from '@/lib/phone'
import { getMyContracts, getContractsAsAdmin } from '@/app/actions/contracts'
import { getMyRoster, getMyCumulativeWorkedHours, getRosterAsAdmin, getCumulativeWorkedHoursAsAdmin, getWorkerTierRanking, type MyShift, type WorkerTierRankingByRole } from '@/app/actions/roster'
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

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function hhmm(t: string) { return t.slice(0, 5) }

function AdminShield({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z' />
      <path d='M9 12l2 2 4-4' />
    </svg>
  )
}

// 랭킹 개인정보 보호 — 이름 가운데 글자를 * 처리 ("김수현" → "김*현", 2글자는 뒷글자)
function maskMiddleName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= 1) return name
  if (chars.length === 2) return `${chars[0]}*`
  const mid = Math.floor(chars.length / 2)
  return chars.map((c, i) => (i === mid ? '*' : c)).join('')
}

// 티어 텍스트 뱃지 대신 왕관 아이콘으로 표현 — 등수만 봐도 색으로 구분되게
function TierCrown({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill={color} style={{ filter: `drop-shadow(0 0 3px ${color}90)` }}>
      <path d='M5 16 3 5l6 4 3-6 3 6 6-4-2 11H5Z' />
      <rect x='4' y='18' width='16' height='2.5' rx='0.5' />
    </svg>
  )
}

// 서버 컴포넌트(page.tsx)가 프리페치한 초기 데이터 — null이면 기존 클라이언트 조회로 폴백
export interface InitialMyData {
  profile: UserProfile | null
  stats: MyOrderStats | null
  contracts: ContractRecord[]
  shifts: MyShift[] | null
  cumulativeHours: number | null
}

export default function MyPageClient({ initial }: { initial: InitialMyData | null }) {
  const [profile, setProfile] = useState<UserProfile | null>(initial?.profile ?? null)
  const [authName, setAuthName] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(initial?.profile?.worker_role === 'admin')
  const [stats, setStats] = useState<MyOrderStats | null>(initial?.stats ?? null)
  // 0번 탭은 팝업이 2개 이상일 때 자동으로 붙는 "전체" 합산 탭 — 기본 선택
  const [activePopupIdx, setActivePopupIdx] = useState(0)
  const [loading, setLoading] = useState(initial == null)
  const [myShifts, setMyShifts] = useState<MyShift[] | null>(initial?.shifts ?? null)
  const [workedHours, setWorkedHours] = useState<number>(initial?.cumulativeHours ?? 0)

  // 관리자가 다른 근무자의 MY 페이지를 조회하는 기능 — 스케줄 탭의 직원 선택기와 동일한 패턴.
  // ownUserId(로그인 계정)와 viewingUserId(현재 화면에 보이는 대상)를 분리한다.
  const [ownUserId, setOwnUserId] = useState<string | null>(null)
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)
  const [viewingUserName, setViewingUserName] = useState<string | null>(null)
  const [userPicker, setUserPicker] = useState<UserProfile[] | null>(null)
  const [isSwitchingUser, setIsSwitchingUser] = useState(false)
  const isOwnView = viewingUserId == null || viewingUserId === ownUserId

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editBankName, setEditBankName] = useState('')
  const [editBankAccount, setEditBankAccount] = useState('')
  const [editHealthCert, setEditHealthCert] = useState<File | null>(null)
  const [isEditPending, startEditTransition] = useTransition()
  const editFileRef = useRef<HTMLInputElement>(null)

  const [residentFront, setResidentFront] = useState('')
  const [residentBack, setResidentBack] = useState('')
  const [isResidentPending, startResidentTransition] = useTransition()

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
  const [tierRanking, setTierRanking] = useState<WorkerTierRankingByRole>({ kitchen: [], cashier: [] })
  const [rankingTab, setRankingTab] = useState<'cashier' | 'kitchen'>('cashier')
  const [showAllRanking, setShowAllRanking] = useState(false)

  // 근무 티어 랭킹 — 조회 대상과 무관한 전체 순위라 프리페치 여부와 별개로 한 번만 불러온다
  useEffect(() => {
    getWorkerTierRanking().then(res => {
      if (res.success && res.data) setTierRanking(res.data)
    })
  }, [])

  useEffect(() => {
    const load = async () => {
      // getSession()은 로컬 쿠키 판독 — getUser()의 인증 서버 왕복을 제거
      const supabase = createSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (user) {
        setAuthName(user.user_metadata?.name ?? null)
        setAuthEmail(user.email ?? null)
        setOwnUserId(user.id)
        setViewingUserId(user.id)
        // 프리페치된 profile.worker_role이 우선 — 없을 때만 메타데이터로 판정
        if (initial?.profile == null) setIsAdmin(user.user_metadata?.role === 'admin')
      }
      if (initial != null) return // 서버 프리페치 성공 시 마운트 조회 생략
      const [profileRes, statsRes, contractsRes, rosterRes, hoursRes] = await Promise.all([
        getMyProfile(),
        getMyOrderStats(),
        getMyContracts(),
        getMyRoster(),
        getMyCumulativeWorkedHours(),
      ])
      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data)
        setIsAdmin(profileRes.data.worker_role === 'admin')
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data)
        setActivePopupIdx(0)
      }
      if (contractsRes.success && contractsRes.data) {
        setContracts(contractsRes.data)
      }
      if (rosterRes.success && rosterRes.data) {
        setMyShifts(rosterRes.data.shifts)
      }
      if (hoursRes.success && hoursRes.data) {
        setWorkedHours(hoursRes.data.totalHours)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 관리자 확정 시 직원 선택기 목록을 조회 — 일반 근무자는 호출조차 하지 않는다
  useEffect(() => {
    if (!isAdmin) return
    fetchAllUserProfiles().then(res => {
      if (res.success && res.data) setUserPicker(res.data)
    })
  }, [isAdmin])

  const handlePickUser = (userId: string, name: string) => {
    if (userId === viewingUserId) return
    setViewingUserId(userId)
    setViewingUserName(name)
    setIsSwitchingUser(true)
    const own = userId === ownUserId
    const load = own
      ? Promise.all([getMyProfile(), getMyOrderStats(), getMyContracts(), getMyRoster(), getMyCumulativeWorkedHours()])
      : Promise.all([getUserProfileAsAdmin(userId), getOrderStatsAsAdmin(userId), getContractsAsAdmin(userId), getRosterAsAdmin(userId), getCumulativeWorkedHoursAsAdmin(userId)])
    load.then(([profileRes, statsRes, contractsRes, rosterRes, hoursRes]) => {
      setProfile(profileRes.success ? profileRes.data ?? null : null)
      setStats(statsRes.success ? statsRes.data ?? null : null)
      setActivePopupIdx(0)
      setContracts(contractsRes.success && contractsRes.data ? contractsRes.data : [])
      setMyShifts(rosterRes.success && rosterRes.data ? rosterRes.data.shifts : [])
      setWorkedHours(hoursRes.success && hoursRes.data ? hoursRes.data.totalHours : 0)
      setIsSwitchingUser(false)
    })
  }

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
    if (!profile.resident_reg_no_masked) items.push('주민등록번호')
    return items
  }, [profile])

  // 팝업이 2개 이상이면 일자별로 합산한 "전체" 탭을 맨 앞에 붙인다
  const allPopupStat: PopupOrderStat | null = useMemo(() => {
    if (!stats || stats.byPopup.length < 2) return null
    const dailyMap = new Map<string, { orders: number; revenue: number }>()
    for (const p of stats.byPopup) {
      for (const d of p.daily) {
        const cur = dailyMap.get(d.date) ?? { orders: 0, revenue: 0 }
        cur.orders += d.orders
        cur.revenue += d.revenue
        dailyMap.set(d.date, cur)
      }
    }
    const daily = [...dailyMap.entries()]
      .map(([date, v]) => ({ date, orders: v.orders, revenue: v.revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return { popupId: -1, popupName: '전체', orders: stats.totalOrders, revenue: stats.totalRevenue, daily, byPaymentMethod: {} }
  }, [stats])

  const handleSaveResidentId = () => {
    const front = residentFront.trim()
    const back = residentBack.trim()
    if (!isValidResidentRegistrationNumber(front, back)) {
      toast.error('주민등록번호를 올바르게 입력해주세요.')
      return
    }
    startResidentTransition(async () => {
      const res = await setMyResidentId(front, back)
      if (res.success) {
        toast.success('주민등록번호가 등록됐습니다.')
        setResidentFront(''); setResidentBack('')
        const profileRes = await getMyProfile()
        if (profileRes.success && profileRes.data) setProfile(profileRes.data)
      } else {
        toast.error(res.error ?? '등록 실패')
      }
    })
  }

  const startEdit = () => {
    setEditName(profile?.name ?? authName ?? '')
    setEditEmail(authEmail ?? '')
    setEditPhone(profile?.phone ? formatPhoneInput(profile.phone) : '')
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
        <main className='min-h-screen p-3 md:p-5 pb-10'>
          <div className='max-w-[560px] lg:max-w-[900px] mx-auto space-y-4 animate-pulse'>
            {/* 프로필 + 티어 통합 카드 */}
            <div className='rounded-2xl bg-gray-100 h-[200px]' />
            {/* 판매 통계 카드 */}
            <div className='rounded-2xl border border-hairline bg-canvas p-4 h-[140px]'>
              <div className='h-4 w-24 bg-gray-100 rounded mb-3' />
              <div className='h-3 w-full bg-gray-100 rounded mb-2' />
              <div className='h-3 w-2/3 bg-gray-100 rounded' />
            </div>
          </div>
        </main>
      </>
    )
  }

  const displayName = profile?.name ?? (isOwnView ? authName : viewingUserName) ?? '—'
  // authEmail은 로그인 계정 본인의 이메일 — 다른 근무자 조회 중에는 보여줄 이메일이 없다
  const displayEmail = isOwnView ? (authEmail ?? '—') : null
  const inputClass =
    'w-full border border-hairline rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 bg-canvas'
  const popupTabs: PopupOrderStat[] = allPopupStat ? [allPopupStat, ...(stats?.byPopup ?? [])] : (stats?.byPopup ?? [])
  const activePopup: PopupOrderStat | undefined = popupTabs[activePopupIdx]

  return (
    <>
      <NavBar />
      <main className='min-h-screen p-4 pb-10'>
        <div className='max-w-[560px] lg:max-w-[900px] mx-auto space-y-4 lg:space-y-5'>

          {/* 직원 선택기 (관리자 전용) — 다른 근무자의 MY 페이지를 조회 */}
          {isAdmin && userPicker && userPicker.length > 0 && (
            <UserPicker users={userPicker} ownUserId={ownUserId} viewingUserId={viewingUserId} disabled={isSwitchingUser} onPick={handlePickUser} />
          )}

          {!isOwnView && (
            <div className='rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2.5 flex items-center justify-between gap-3'>
              <p className='m-0 text-[13px] font-bold text-primary-700'>{viewingUserName ?? displayName}님의 정보를 조회 중입니다 (읽기 전용)</p>
              <button type='button' onClick={() => ownUserId && handlePickUser(ownUserId, authName ?? '나')}
                className='shrink-0 text-[12px] font-bold text-primary-700 bg-transparent border-none cursor-pointer underline'>
                내 정보로 돌아가기
              </button>
            </div>
          )}

          {/* 서명 대기 계약서 알림 */}
          {isOwnView && unsignedContracts.length > 0 && (
            <div className='rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3'>
              <div className='flex-1 min-w-0'>
                <p className='m-0 text-[14px] font-bold text-amber-800'>서명 대기 중인 근로계약서 {unsignedContracts.length}건</p>
                <p className='m-0 mt-0.5 text-caption text-amber-700'>계약서를 확인하고 전자서명을 완료해 주세요.</p>
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

          {/* 프로필 + 근무 티어 통합 카드 — 티어 색상을 그대로 내 정보 배경으로 사용 */}
          {(() => {
            // 관리자 계정은 근무 티어 대상이 아니다 — 티어 카드 대신 별도 디자인의 관리자 카드를 보여준다
            const isViewedAdmin = profile?.worker_role === 'admin'
            if (isViewedAdmin) {
              return (
                <section className='rounded-2xl p-5 shadow-level-1 overflow-hidden bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600 text-white'>
                  <div className='flex items-center gap-3.5'>
                    <div className='w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-[24px] font-extrabold shrink-0'>
                      {displayName.charAt(0)}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2'>
                        <p className='m-0 text-[19px] font-extrabold leading-tight'>{displayName}</p>
                        <span className='inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/15'>
                          <AdminShield size={12} /> 관리자
                        </span>
                      </div>
                      {displayEmail && <p className='m-0 mt-0.5 text-[13px] opacity-70 truncate'>{displayEmail}</p>}
                    </div>
                    <AdminShield size={32} />
                  </div>
                  <p className='m-0 mt-4 text-[12px] opacity-60'>관리자 계정은 근무 티어 시스템 대상이 아닙니다.</p>
                </section>
              )
            }

            const { current, next } = getWorkerTier(workedHours)
            const progress = next
              ? Math.min(100, ((workedHours - current.threshold) / (next.threshold - current.threshold)) * 100)
              : 100
            return (
              <section className='rounded-2xl p-5 shadow-level-1 overflow-hidden' style={{ background: current.bg, boxShadow: current.shadow }}>
                <div className='flex items-center gap-3.5 mb-4'>
                  <div className='w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-[24px] font-extrabold shrink-0' style={{ color: current.labelText }}>
                    {displayName.charAt(0)}
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2'>
                      <p className='m-0 text-[19px] font-extrabold leading-tight' style={{ color: current.labelText }}>{displayName}</p>
                    </div>
                    {displayEmail && <p className='m-0 mt-0.5 text-[13px] truncate' style={{ color: current.mute }}>{displayEmail}</p>}
                  </div>
                </div>

                <div className='flex items-center justify-between mb-3'>
                  <div>
                    <p className='m-0 text-caption font-semibold mb-0.5' style={{ color: current.mute }}>내 근무 티어</p>
                    <p className='m-0 text-[26px] font-black leading-none' style={{ color: current.labelText }}>{current.name}</p>
                  </div>
                  <div className='text-right'>
                    <p className='m-0 text-caption' style={{ color: current.mute }}>누적 근무시간</p>
                    <p className='m-0 text-[19px] font-bold' style={{ color: current.accent }}>{workedHours}h</p>
                  </div>
                </div>
                {next && (
                  <>
                    <div className='w-full rounded-full h-2 mb-1.5' style={{ background: 'rgba(255,255,255,0.2)' }}>
                      <div className='h-2 rounded-full transition-all' style={{ width: `${progress}%`, background: current.accent }} />
                    </div>
                    <p className='m-0 text-caption' style={{ color: current.mute }}>
                      다음 티어 {next.ko}까지 {Math.round((next.threshold - workedHours) * 10) / 10}h 남음
                    </p>
                  </>
                )}
              </section>
            )
          })()}

          {/* 다음 근무 미리보기 → 근무 일정 바로가기 (다른 근무자 조회 중에는 본인 스케줄 탭으로 링크하지 않음) */}
          {myShifts !== null && (() => {
            const body = (
              <div className='flex items-center gap-3 h-full'>
                <div className='flex-1 min-w-0'>
                  <p className='m-0 text-caption font-bold text-ink-muted'>다음 근무</p>
                  {nextShift ? (() => {
                    const d = new Date(nextShift.work_date + 'T00:00:00')
                    return (
                      <p className='m-0 mt-1 text-title text-ink'>
                        {d.getMonth() + 1}월 {d.getDate()}일 ({DAY_NAMES[d.getDay()]}) {hhmm(nextShift.start_time)} ~ {hhmm(nextShift.end_time)}
                      </p>
                    )
                  })() : (
                    <p className='m-0 mt-1 text-body-sm font-bold text-ink-muted'>예정된 근무가 없습니다</p>
                  )}
                  {monthSummary && monthSummary.days > 0 && (
                    <p className='m-0 mt-1 text-caption text-ink-muted'>
                      이번 달 근무 <span className='font-bold text-primary-700'>{monthSummary.days}일</span> · <span className='font-bold text-primary-700'>{monthSummary.hours}h</span>
                    </p>
                  )}
                </div>
                {isOwnView && <span className='shrink-0 text-caption font-bold text-primary-700'>일정 보기 ›</span>}
              </div>
            )
            return isOwnView ? (
              <Link href='/my/schedule' className='block rounded-2xl bg-canvas border border-hairline shadow-level-1 p-4 no-underline hover:border-primary-200 hover:shadow-level-2 transition h-full'>
                {body}
              </Link>
            ) : (
              <div className='rounded-2xl bg-canvas border border-hairline shadow-level-1 p-4 h-full'>{body}</div>
            )
          })()}

          {/* 근무 티어 랭킹 — 주방/캐셔 부문 분리, 이름 마스킹 + 왕관 아이콘 + 누적 근무시간 */}
          {(tierRanking.cashier.length > 0 || tierRanking.kitchen.length > 0) && (() => {
            const activeRanking = tierRanking[rankingTab]
            return (
              <section className='bg-canvas border border-hairline rounded-2xl p-4 lg:p-5 shadow-level-1'>
                <div className='flex items-center justify-between mb-3'>
                  <h2 className='m-0 text-title text-ink'>근무 티어 랭킹</h2>
                  <div className='flex gap-1 rounded-lg bg-canvas-soft p-0.5'>
                    {(['cashier', 'kitchen'] as const).map(tab => (
                      <button
                        key={tab}
                        type='button'
                        onClick={() => { setRankingTab(tab); setShowAllRanking(false) }}
                        className={`px-3 py-1 rounded-md text-[12px] font-bold cursor-pointer transition ${
                          rankingTab === tab ? 'bg-canvas text-ink shadow-level-1' : 'text-ink-muted'
                        }`}
                      >
                        {tab === 'cashier' ? '캐셔' : '주방'}
                      </button>
                    ))}
                  </div>
                </div>
                {activeRanking.length === 0 ? (
                  <p className='m-0 py-4 text-center text-body-sm text-ink-muted'>아직 근무 기록이 없어요.</p>
                ) : (
                  <>
                    <div className='overflow-x-auto'>
                      <table className='w-full text-body-sm border-collapse'>
                        <thead>
                          <tr className='border-b border-hairline'>
                            <th className='text-left py-1.5 pr-2 font-semibold text-ink-muted w-8'>#</th>
                            <th className='text-left py-1.5 pr-2 font-semibold text-ink-muted'>이름</th>
                            <th className='text-left py-1.5 pr-2 font-semibold text-ink-muted'>티어</th>
                            <th className='text-right py-1.5 font-semibold text-ink-muted'>누적 근무시간</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(showAllRanking ? activeRanking : activeRanking.slice(0, 5)).map((row, i) => {
                            const { current, dot } = getWorkerTier(row.hours)
                            const isMe = row.name === displayName
                            return (
                              <tr key={`${row.name}-${i}`} className={`border-b border-hairline last:border-b-0 ${isMe ? 'bg-primary-50' : ''}`}>
                                <td className='py-1.5 pr-2 text-ink-muted'>{i + 1}</td>
                                <td className='py-1.5 pr-2 font-semibold text-ink'>{maskMiddleName(row.name)}{isMe && ' (나)'}</td>
                                <td className='py-1.5 pr-2'>
                                  <div className='flex items-center gap-1.5'>
                                    <TierCrown color={dot} />
                                    <span className='text-[11px] font-black tracking-wide' style={{ color: dot }}>{current.name}</span>
                                  </div>
                                </td>
                                <td className='py-1.5 text-right font-bold text-ink'>{row.hours}h</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {activeRanking.length > 5 && (
                      <button
                        type='button'
                        onClick={() => setShowAllRanking(v => !v)}
                        className='w-full mt-2 py-2 rounded-xl bg-canvas-soft border border-hairline text-[12px] font-bold text-ink-muted cursor-pointer hover:bg-canvas-soft/70 transition'
                      >
                        {showAllRanking ? '접기' : `더보기 (전체 ${activeRanking.length}명)`}
                      </button>
                    )}
                  </>
                )}
              </section>
            )
          })()}

          {/* 판매 통계 */}
          {stats && stats.totalOrders > 0 && (
            <section className='bg-canvas border border-hairline rounded-2xl p-4 lg:p-5 shadow-level-1'>
              <div className='flex items-center justify-between mb-3'>
                <h2 className='m-0 text-title text-ink'>내 판매 통계</h2>
                <span className='text-caption text-ink-muted'>
                  전체 {stats.totalOrders}건 · {formatPrice(stats.totalRevenue)}
                </span>
              </div>

              {/* 팝업 탭 (전체 합산 탭 포함) */}
              {popupTabs.length > 1 && (
                <div className='flex gap-1.5 mb-4 flex-wrap'>
                  {popupTabs.map((p, i) => (
                    <button
                      key={p.popupId}
                      type='button'
                      onClick={() => setActivePopupIdx(i)}
                      className={`text-caption px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-semibold ${
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
            </section>
          )}

          {/* 내 정보 */}
          <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='m-0 text-title text-ink'>내 정보</h2>
              {isOwnView && !isEditing && (
                <button type='button' onClick={startEdit}
                  className='text-[13px] px-3 py-1.5 rounded-xl border border-hairline text-ink-muted hover:text-primary-700 hover:border-primary-300 transition-colors bg-transparent cursor-pointer font-semibold'>
                  수정
                </button>
              )}
            </div>

            {isOwnView && isEditing ? (
              <div className='space-y-2.5'>
                <input type='text' value={editName} onChange={(e) => setEditName(e.target.value)} placeholder='이름' className={inputClass} />
                <input type='email' value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder='이메일' className={inputClass} />
                <input type='tel' value={editPhone} onChange={(e) => setEditPhone(formatPhoneInput(e.target.value))} placeholder='전화번호' className={inputClass} maxLength={13} />
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
                {!profile ? (
                  <>
                    <InfoRow label='이름' value={displayName} />
                    {displayEmail && <InfoRow label='이메일' value={displayEmail} />}
                    <p className='m-0 text-[13px] text-ink-muted'>직원 프로필이 연결되지 않았습니다.{isOwnView && isAdmin ? ' (관리자 계정)' : ''}</p>
                  </>
                ) : (
                  <>
                    {/* 데스크톱에서는 항목 나열을 2열로 배치해 넓은 화면을 활용 */}
                    <div className='space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-2.5'>
                      <InfoRow label='이름' value={displayName} />
                      {displayEmail && <InfoRow label='이메일' value={displayEmail} />}
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
                      {(profile.resident_reg_no_masked || !isOwnView) && (
                        <InfoRow label='주민등록번호' value={profile.resident_reg_no_masked ?? '미등록'} />
                      )}
                    </div>
                    {!profile.resident_reg_no_masked && isOwnView && (
                      <div className='rounded-xl border border-hairline p-3 bg-canvas-soft space-y-2 lg:max-w-[360px]'>
                        <p className='m-0 text-[13px] font-semibold text-ink'>주민등록번호 등록 (고용·산재보험 신고용)</p>
                        <div className='flex items-center gap-2'>
                          <input type='text' inputMode='numeric' maxLength={6} value={residentFront}
                            onChange={(e) => setResidentFront(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder='앞자리' className={`${inputClass} text-center`} />
                          <span className='text-ink-faint'>-</span>
                          <input type='password' inputMode='numeric' maxLength={7} value={residentBack}
                            onChange={(e) => setResidentBack(e.target.value.replace(/\D/g, '').slice(0, 7))}
                            placeholder='뒷자리' className={`${inputClass} text-center`} />
                        </div>
                        <button type='button' onClick={handleSaveResidentId} disabled={isResidentPending}
                          className='w-full border-none rounded-xl px-3 py-2 text-[13px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'>
                          {isResidentPending ? '등록 중...' : '등록'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* 내 근로계약서 */}
          <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
            <h2 className='m-0 mb-3 text-title text-ink'>
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
                      {isOwnView && !c.worker_signed_at && (
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

          {/* 비밀번호 변경 (본인 조회 시에만) */}
          {isOwnView && (
          <section className='bg-canvas border border-hairline rounded-2xl p-4 shadow-level-1'>
            <div className='flex items-center justify-between'>
              <h2 className='m-0 text-title text-ink'>비밀번호 변경</h2>
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
          )}

          {/* 계정 탈퇴 — 맨 아래 작은 링크, 누르면 확인 폼 펼침 (본인 조회 시에만) */}
          {isOwnView && (
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
          )}

          {/* 근로계약서 서명 모달 (본인 조회 시에만 상태 세팅됨) */}
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
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue')
  const avgRevenue = popup.daily.length > 0 ? Math.round(popup.revenue / popup.daily.length) : 0

  return (
    <div>
      {/* 요약 카드 */}
      <div className='grid grid-cols-3 gap-2.5 lg:gap-3 mb-4'>
        <div className='bg-canvas-soft rounded-xl p-3.5 lg:p-4'>
          <p className='m-0 text-[11px] text-ink-muted mb-1'>총 주문</p>
          <p className='m-0 text-[19px] lg:text-[22px] font-black text-ink leading-tight'>
            {popup.orders.toLocaleString()}
            <span className='text-[12px] font-normal text-ink-muted ml-0.5'>건</span>
          </p>
        </div>
        <div className='bg-canvas-soft rounded-xl p-3.5 lg:p-4'>
          <p className='m-0 text-[11px] text-ink-muted mb-1'>총 매출</p>
          <p className='m-0 text-[19px] lg:text-[22px] font-black text-ink leading-tight'>{formatPrice(popup.revenue)}</p>
        </div>
        <div className='bg-canvas-soft rounded-xl p-3.5 lg:p-4'>
          <p className='m-0 text-[11px] text-ink-muted mb-1'>일평균 매출</p>
          <p className='m-0 text-[19px] lg:text-[22px] font-black text-ink leading-tight'>{formatPrice(avgRevenue)}</p>
        </div>
      </div>

      <div className='lg:grid lg:grid-cols-[1fr_300px] lg:gap-5 lg:items-start'>
        {/* 일별 차트 — 매출/주문 토글 */}
        {popup.daily.length > 1 && (
          <div className='mb-4 lg:mb-0'>
            <div className='flex items-center justify-between mb-3'>
              <p className='m-0 text-caption text-ink-muted'>일별 추이</p>
              <div className='flex gap-1 rounded-lg bg-canvas-soft p-0.5'>
                {(['revenue', 'orders'] as const).map(m => (
                  <button
                    key={m}
                    type='button'
                    onClick={() => setMetric(m)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                      metric === m ? 'bg-canvas text-primary-700 shadow-level-1' : 'bg-transparent text-ink-faint hover:text-ink-muted'
                    }`}
                  >
                    {m === 'revenue' ? '매출' : '주문'}
                  </button>
                ))}
              </div>
            </div>
            <DailyRevenueChart daily={popup.daily} formatPrice={formatPrice} metric={metric} height={220} />
          </div>
        )}

        {/* 일별 표 */}
        <div>
          <p className='m-0 text-caption text-ink-muted mb-2'>일별 상세</p>
          <div className='overflow-hidden rounded-xl border border-hairline lg:max-h-[260px] lg:overflow-y-auto'>
            <table className='w-full text-caption'>
              <thead className='lg:sticky lg:top-0'>
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
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex items-center gap-3'>
      <span className='text-[13px] text-ink-muted w-24 shrink-0 whitespace-nowrap'>{label}</span>
      <span className='text-[14px] text-ink'>{value}</span>
    </div>
  )
}

// ── 직원 선택기 (관리자 전용) — /my/schedule의 StaffPicker와 동일한 패턴 ──────────

function UserPicker({ users, ownUserId, viewingUserId, disabled, onPick }: {
  users: UserProfile[]
  ownUserId: string | null
  viewingUserId: string | null
  disabled: boolean
  onPick: (id: string, name: string) => void
}) {
  const ownName = ownUserId != null ? users.find(u => u.id === ownUserId)?.name ?? null : null
  const others = users.filter(u => u.id !== ownUserId)

  return (
    <section className='bg-canvas rounded-2xl border border-hairline shadow-level-1 p-4'>
      <label className='block mb-2 text-[13px] font-bold text-ink-muted'>직원 선택 (관리자 전용)</label>
      <select
        value={viewingUserId ?? ''}
        disabled={disabled}
        onChange={e => {
          const id = e.target.value
          const picked = users.find(u => u.id === id)
          onPick(id, picked?.name ?? (id === ownUserId ? (ownName ?? '나') : ''))
        }}
        className='w-full border border-hairline rounded-xl px-3 py-2.5 text-[14px] font-semibold bg-canvas-soft text-ink outline-none focus:border-primary-700 disabled:opacity-60'
      >
        {ownUserId != null && <option value={ownUserId}>내 정보{ownName ? ` (${ownName})` : ''}</option>}
        {others.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </section>
  )
}
