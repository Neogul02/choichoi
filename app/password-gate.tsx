'use client'

import { useEffect, useRef, useState } from 'react'
import { formatBankAccountInput, isValidBankAccount, normalizeBankAccount, BANK_ACCOUNT_MAX_DIGITS, BANK_ACCOUNT_RULE_MESSAGE } from '@/lib/bank'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { fetchActivePopupEvents } from '@/app/actions/schedule'
import { createWorkerAccount, resolveLoginEmail, checkAdminLoginCode, checkPopupAccess, updateMyProfile } from '@/app/actions/workers'
import { isValidResidentRegistrationNumber } from '@/lib/resident-id'
import { formatPhoneInput, isValidKoreanPhone, normalizePhone } from '@/lib/phone'
import { notifyLoginEvent } from '@/app/actions/discord'
import { withTimeout } from '@/lib/utils'
import LoadingScreen from '@/components/LoadingScreen'
import type { PopupEvent } from '@/types/database'
import {
  CASHIER_NAME_KEY, POPUP_ID_KEY, POPUP_NAME_KEY, WORKER_ROLE_KEY, APP_ROLE_KEY,
  setPopupIdCookie, clearChoichoiStorage,
} from '@/lib/storage-keys'

type View = 'login' | 'signup' | 'admin-code'

/**
 * 서버(루트 레이아웃)가 세션 쿠키·근무지 쿠키로 미리 판정한 초기 상태.
 * 예전엔 항상 checked=false로 시작해 서버 HTML이 늘 "로그인 확인 중..." 화면이었고, 서버가 데이터를 미리 받아
 * 만든 페이지는 JS 로드·하이드레이션·세션 확인이 끝날 때까지 보이지 않았다.
 * - checked=true, authed=true  → 첫 렌더부터 페이지를 그린다
 * - checked=true, authed=false → 첫 렌더부터 로그인 폼
 * - checked=false              → 서버가 판정할 수 없음(세션은 있는데 근무지 쿠키가 없는 구버전 로그인) — 예전 흐름
 * 클라이언트 세션 확인은 그대로 돈다. 실제 권한은 proxy.ts와 서버 액션이 건다.
 */
export interface GateInitial {
  checked: boolean
  authed: boolean
  /** 로그인된 admin 세션이 관리자 코드를 아직 통과하지 않았다(코드 도입 전 세션, 쿠키 삭제 등) */
  adminCodePending?: boolean
}

type AuthUser = { id: string; user_metadata?: { name?: string }; app_metadata?: Record<string, unknown> }

export default function PasswordGate({ children, initial }: { children: React.ReactNode; initial?: GateInitial }) {
  const pathname = usePathname()

  const [checked, setChecked] = useState(initial?.checked ?? false)
  const [isAuthed, setIsAuthed] = useState(initial?.authed ?? false)
  const [view, setView] = useState<View>(initial?.adminCodePending ? 'admin-code' : 'login')
  // 이미 로그인된 세션의 관리자 코드 재확인 — 통과하면 로그인 후처리 없이 화면만 다시 연다
  const resumingAdminCode = useRef(!!initial?.adminCodePending)
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([])
  const [selectedPopupId, setSelectedPopupId] = useState<number | 'kitchen' | ''>('')

  // 로그인 필드
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // 회원가입 필드 (비번 없음 — 초기 비번 = 전화번호)
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupBankName, setSignupBankName] = useState('')
  const [signupBankAccount, setSignupBankAccount] = useState('')
  const [signupResidentFront, setSignupResidentFront] = useState('')
  const [signupResidentBack, setSignupResidentBack] = useState('')
  const [signupHealthCert, setSignupHealthCert] = useState<File | null>(null)
  const [signupInviteCode, setSignupInviteCode] = useState('')
  const [signupConsent, setSignupConsent] = useState(false)
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false)

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 관리자 2차 코드 단계 — 로그인은 통과했지만 아직 화면을 열어주지 않은 상태의 보류 정보
  const [adminCode, setAdminCode] = useState('')
  const [pendingAuth, setPendingAuth] = useState<{ user: AuthUser; email: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loginPasswordRef = useRef<HTMLInputElement>(null)
  const signupEmailRef = useRef<HTMLInputElement>(null)
  const signupPhoneRef = useRef<HTMLInputElement>(null)
  const signupBankNameRef = useRef<HTMLInputElement>(null)
  const signupBankAccountRef = useRef<HTMLInputElement>(null)
  const signupResidentFrontRef = useRef<HTMLInputElement>(null)
  const signupResidentBackRef = useRef<HTMLInputElement>(null)
  const signupInviteCodeRef = useRef<HTMLInputElement>(null)

  // PasswordGate는 라우트 전환에도 리마운트되지 않으므로(위 주석 참고) pathname을 deps에 넣어야
  // "/"로 처음 들어왔다가 /pos로 클라이언트 사이드 이동한 경우에도 팝업 목록을 뒤늦게 가져올 수 있다.
  // 한 번 성공하면 다시 부르지 않는다(hasFetchedPopupsRef) — /display, /는 로그인 폼 자체를 안 쓰므로 계속 건너뜀.
  const hasFetchedPopupsRef = useRef(false)
  useEffect(() => {
    if (hasFetchedPopupsRef.current) return
    if (pathname === '/display' || pathname === '/') return
    hasFetchedPopupsRef.current = true
    fetchActivePopupEvents().then((result) => {
      if (result.success && result.data) {
        setPopupEvents(result.data)
        if (result.data.length === 1) setSelectedPopupId(result.data[0].id)
      }
    })
  }, [pathname])

  // 분기 페이지의 "처음이라면? 회원가입" 링크(/pos?view=signup)로 들어왔을 때 바로 회원가입 화면을 띄움
  // useSearchParams 대신 window.location을 직접 읽어 전체 앱의 정적 렌더링에 영향을 주지 않는다.
  // PasswordGate는 레이아웃에 상주해 라우트 전환 시 리마운트되지 않으므로, pathname을 의존성에 넣어
  // "/" → "/pos?view=signup" 같은 클라이언트 사이드 이동 후에도 쿼리를 다시 읽도록 한다.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('view') === 'signup') setView('signup')
  }, [pathname])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    // 낙관적 렌더: 이전 로그인 흔적(근무지 선택 기록)이 있으면 화면을 먼저 보여주고 세션은 뒤에서 검증
    // — 검증 실패 시 아래 checkAuth가 로그인 화면으로 되돌린다
    try {
      if (localStorage.getItem(POPUP_ID_KEY) && !resumingAdminCode.current) { setIsAuthed(true); setChecked(true) }
    } catch { /* ignore */ }

    const checkAuth = async () => {
      if (resumingAdminCode.current) return
      // getSession()은 저장된 세션을 로컬에서 읽어 네트워크 왕복 없이 판정한다 (만료 시에만 갱신 요청)
      // 실제 권한 검증은 proxy.ts와 서버 액션이 담당하므로 이 게이트는 UX용 판정으로 충분
      const { data: { session } } = await supabase.auth.getSession()
      setIsAuthed(!!session && !!localStorage.getItem(POPUP_ID_KEY))
      setChecked(true)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { clearChoichoiStorage(); setIsAuthed(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (pathname === '/display' || pathname === '/') return <>{children}</>
  if (!checked) return <LoadingScreen label="로그인 확인 중..." />

  const inputClass =
    'w-full border border-hairline rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3 bg-canvas'

  // 로그인 성공(비밀번호 로그인 또는 회원가입 직후 자동 로그인) 후 공통 후처리.
  // 권한은 서버가 app_metadata.role에 기록한다(setUserRole·createWorkerAccount) — 여기서는 이름만 동기화한다.
  const finishAuth = async (user: AuthUser, email: string) => {
    const supabase = createSupabaseBrowserClient()

    // user_profiles에서 이름 조회 — localStorage 기록(캐셔 이름 등)에 필요하므로 이것만 기다린다
    const { data: profile } = await withTimeout(
      Promise.resolve(supabase.from('user_profiles').select('name').eq('id', user.id).maybeSingle()),
      8000,
      '프로필 조회',
    )

    // 역할은 서버 권한 판단과 같은 출처(app_metadata.role, 로그인 응답의 user에 실려 온다)에서 읽는다 — 화면 캐시용.
    // kiosk는 주방 출근부 전용 계정(UserAppRole에 넣지 않은 별도 역할) — 'user'로 뭉개면 출근부로 보내지 못한다
    const appRole = user.app_metadata?.role
    const syncedRole =
      appRole === 'admin' ? 'admin' :
      appRole === 'manager' ? 'manager' :
      appRole === 'kiosk' ? 'kiosk' : 'user'
    // 이름 동기화는 백그라운드로 — 실패해도 로그인을 막지 않는다
    supabase.auth.updateUser({
      data: { name: profile?.name ?? user.user_metadata?.name },
    }).catch(() => { /* 다음 로그인 시 재동기화됨 */ })

    const name = profile?.name ?? user.user_metadata?.name ?? ''
    const isKitchen = selectedPopupId === 'kitchen'
    const popup = isKitchen ? null : popupEvents.find((p) => p.id === selectedPopupId)
    try {
      if (name) localStorage.setItem(CASHIER_NAME_KEY, name)
      localStorage.setItem(POPUP_ID_KEY, isKitchen ? '0' : String(selectedPopupId))
      setPopupIdCookie(isKitchen ? '0' : String(selectedPopupId))
      localStorage.setItem(POPUP_NAME_KEY, isKitchen ? '주방' : (popup?.name ?? ''))
      localStorage.setItem(WORKER_ROLE_KEY, isKitchen ? 'kitchen' : '')
      localStorage.setItem(APP_ROLE_KEY, syncedRole)
    } catch { /* ignore */ }

    notifyLoginEvent(name, email).catch(() => {})
    setIsAuthed(true)

    if (syncedRole === 'kiosk') {
      if (!window.location.pathname.startsWith('/attendance')) window.location.href = '/attendance'
      return
    }

    // 주방은 POS를 쓰지 않으므로 바로 내 근무 일정으로 보낸다.
    // 이미 /schedule에 있으면 그대로 두어 불필요한 새로고침을 막는다.
    if (isKitchen && !window.location.pathname.startsWith('/schedule')) {
      window.location.href = '/schedule'
    }
  }

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPopupId) { setError('근무지를 선택해주세요.'); return }
    if (!loginEmail.trim() || !loginPassword) {
      setError('이메일(또는 이름)과 비밀번호를 입력해주세요.')
      return
    }
    setError('')
    setIsSubmitting(true)

    try {
      const resolved = await withTimeout(resolveLoginEmail(loginEmail.trim()), 8000, '계정 조회')
      if (!resolved.success || !resolved.data) {
        setError(resolved.error ?? '계정을 찾을 수 없습니다.')
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { data, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({ email: resolved.data.email, password: loginPassword }),
        8000,
        '로그인',
      )

      if (authError || !data.user) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        return
      }

      // 고른 근무지에 배정된 사람인지 먼저 확인한다 — 인사탭 배정이 곧 접근 권한이다.
      // 주방은 제한이 없어 null로 보낸다.
      //
      // signInWithPassword 직후에는 세션 쿠키가 아직 서버 액션 요청에 실리지 않는 순간이 있을 수
      // 있다. 그때 "로그인이 필요합니다"로 떨어지면 멀쩡한 사람이 못 들어오므로 한 번만 다시 묻는다.
      // 로그인은 영업 중 가장 치명적인 경로라 이 한 번이 보험 역할을 한다.
      const askAccess = () =>
        withTimeout(
          checkPopupAccess(selectedPopupId === 'kitchen' ? null : Number(selectedPopupId)),
          8000,
          '근무지 확인',
        )
      let access = await askAccess()
      if (!access.success && access.error?.includes('로그인이 필요')) {
        await new Promise(r => setTimeout(r, 400))
        access = await askAccess()
      }
      if (!access.success || !access.data?.allowed) {
        await supabase.auth.signOut()
        setError(access.error ?? '근무지 확인에 실패했습니다. 다시 시도해주세요.')
        return
      }

      // 관리자는 비밀번호만으로 들어올 수 없다 — 코드가 필요한 계정인지 서버에 묻는다.
      // 판정이 실패하면(네트워크 등) 열어주지 않고 로그인을 되돌린다.
      const gate = await withTimeout(checkAdminLoginCode(null), 8000, '관리자 확인')
      if (!gate.success || !gate.data) {
        await supabase.auth.signOut()
        setError(gate.error ?? '관리자 확인에 실패했습니다. 다시 시도해주세요.')
        return
      }
      if (gate.data.required && !gate.data.verified) {
        setPendingAuth({ user: data.user, email: resolved.data.email })
        setAdminCode('')
        setError('')
        setView('admin-code')
        return
      }

      await finishAuth(data.user, resolved.data.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const onAdminCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingAuth && !resumingAdminCode.current) { setView('login'); return }
    if (!adminCode.trim()) { setError('관리자 코드를 입력해주세요.'); return }
    setError('')
    setIsSubmitting(true)
    try {
      const r = await withTimeout(checkAdminLoginCode(adminCode), 8000, '관리자 코드 확인')
      if (!r.success || !r.data?.verified) {
        setError(r.error ?? '관리자 코드가 올바르지 않습니다.')
        return
      }
      if (!pendingAuth) {
        // 기존 세션 재확인 — 서버가 그린 화면(관리자 메뉴 등)을 코드 쿠키 기준으로 다시 받는다
        window.location.reload()
        return
      }
      await finishAuth(pendingAuth.user, pendingAuth.email)
      setPendingAuth(null)
      setAdminCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '확인 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 코드를 포기하면 세션을 남겨두지 않는다 — 남겨두면 다음 방문 때 코드 없이 들어올 여지가 생긴다
  const onAdminCodeCancel = async () => {
    setPendingAuth(null)
    resumingAdminCode.current = false
    setAdminCode('')
    setError('')
    setView('login')
    await createSupabaseBrowserClient().auth.signOut()
  }

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPopupId) { setError('근무지를 선택해주세요.'); return }
    if (!signupName.trim()) { setError('이름을 입력해주세요.'); return }
    if (!signupEmail.trim()) { setError('이메일을 입력해주세요.'); return }
    if (!signupPhone.trim()) { setError('전화번호를 입력해주세요. (초기 비밀번호로 사용됩니다)'); return }
    if (!isValidKoreanPhone(signupPhone)) { setError('전화번호 형식을 확인해주세요. 0으로 시작하는 국내 번호만 가능합니다. (예: 010-1234-5678)'); return }
    if (!signupInviteCode.trim()) { setError('초대 코드를 입력해주세요.'); return }
    // 계좌는 선택 입력이지만, 넣었다면 자리수까지 맞아야 한다 — 급여 송금에 그대로 쓰는 값이다
    if (signupBankAccount.trim() && !isValidBankAccount(signupBankAccount)) { setError(BANK_ACCOUNT_RULE_MESSAGE); return }
    const residentFront = signupResidentFront.trim()
    const residentBack = signupResidentBack.trim()
    if (!isValidResidentRegistrationNumber(residentFront, residentBack)) {
      setError('주민등록번호를 올바르게 입력해주세요. (고용·산재보험 신고에 필요합니다)')
      return
    }
    if (!signupConsent) { setError('개인정보 수집·이용에 동의해주세요.'); return }

    setError('')
    setIsSubmitting(true)

    const email = signupEmail.trim()
    // DB·비밀번호에는 항상 하이픈 없는 숫자만 넣는다 — 표시 포맷과 저장 포맷이 섞이면 로그인이 안 된다
    const phone = normalizePhone(signupPhone)
    const password = phone

    // 서버 액션: 초대코드 검증 + 계정 생성 + 프로필 INSERT (이메일 발송 없음)
    // 초기 비밀번호는 서버가 전화번호에서 파생하므로 여기서 넘기지 않는다
    const result = await createWorkerAccount({
      inviteCode: signupInviteCode,
      email,
      name: signupName.trim(),
      phone,
      bankName: signupBankName.trim() || undefined,
      bankAccount: normalizeBankAccount(signupBankAccount) || undefined,
      residentIdFront: residentFront,
      residentIdBack: residentBack,
    })

    if (!result.success) {
      setError(result.error ?? '회원가입 중 오류가 발생했습니다.')
      setIsSubmitting(false)
      return
    }

    const supabase = createSupabaseBrowserClient()
    // 가입 직후 자동 로그인 (방금 만든 계정 이메일 + 초기 비밀번호로 즉시 세션 발급)
    const { data, error: authError } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      8000,
      '로그인',
    )

    setIsSubmitting(false)

    if (authError || !data.user) {
      // 자동 로그인만 실패한 경우 — 계정은 이미 생성됐으므로 로그인 화면으로 안내
      setInfo(`가입 완료! 초기 비밀번호는 전화번호(${password})입니다. 로그인해주세요.${signupHealthCert ? ' 보건증은 로그인 후 마이페이지에서 올려주세요.' : ''}`)
      setView('login')
      setSignupName(''); setSignupEmail(''); setSignupPhone('')
      setSignupBankName(''); setSignupBankAccount(''); setSignupResidentFront(''); setSignupResidentBack('')
      setSignupHealthCert(null); setSignupInviteCode(''); setSignupConsent(false)
      return
    }

    // 보건증은 로그인 세션이 생긴 뒤에 올린다 — 버킷 정책이 본인(auth.uid()) 폴더 업로드만 허용하고, 프로필 기록도
    // 본인 수정 서버 액션으로만 된다. 가입 직후(비로그인)에 올리던 때는 업로드·URL 기록이 둘 다 조용히 실패했다.
    if (signupHealthCert) {
      const ext = signupHealthCert.name.split('.').pop()
      const path = `${data.user.id}/health_cert.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('health-certs')
        .upload(path, signupHealthCert, { upsert: true })
      const saved = uploadError
        ? { success: false, error: uploadError.message }
        : await updateMyProfile({ healthCertUrl: supabase.storage.from('health-certs').getPublicUrl(path).data.publicUrl })
      if (!saved.success) console.error('[signup] 보건증 저장 실패:', saved.error)
    }

    await finishAuth(data.user, email)
    setSignupName(''); setSignupEmail(''); setSignupPhone('')
    setSignupBankName(''); setSignupBankAccount(''); setSignupHealthCert(null); setSignupInviteCode(''); setSignupConsent(false)
  }


  const popupSelectField = (
    <div className='relative mb-3'>
      <select
        className={`${inputClass} mb-0 appearance-none pr-8 cursor-pointer ${!selectedPopupId ? 'text-ink-faint' : 'text-ink'}`}
        value={selectedPopupId}
        onChange={(e) => {
          const v = e.target.value
          setSelectedPopupId(v === 'kitchen' ? 'kitchen' : v ? Number(v) : '')
        }}
      >
        <option value=''>근무지 선택</option>
        <option value='kitchen'>주방</option>
        {popupEvents.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint'>
        <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
          <path d='M2 4l4 4 4-4' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
      </span>
    </div>
  )

  if (!isAuthed) {
    return (
      <div className='min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4'>
        <div className='w-full max-w-[360px]'>
          <div className='text-center mb-5'>
            <h1 className='text-2xl font-black text-ink m-0 mb-1'>ChoiChoi 직원</h1>
            <p className='m-0 text-ink-muted text-sm'>
              {view === 'login'
                ? '직원 계정으로 로그인해주세요.'
                : view === 'admin-code'
                  ? '관리자 확인이 한 단계 남았습니다.'
                  : '처음 오셨다면 직원 계정을 만들어주세요.'}
            </p>
          </div>

          {view === 'admin-code' && (
            <form className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline' onSubmit={onAdminCodeSubmit}>
              <div className='text-[12px] text-ink-muted bg-canvas-soft rounded-lg px-3 py-2 mb-3'>
                🔐 관리자 계정입니다. 관리자 코드를 입력해야 로그인이 완료됩니다.
              </div>
              <input
                type='password'
                inputMode='numeric'
                autoFocus
                autoComplete='one-time-code'
                className={inputClass}
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder='관리자 코드'
              />
              {error && <div className='text-rose-600 text-[13px] mt-2'>{error}</div>}
              <button type='submit' disabled={isSubmitting}
                className='w-full mt-3 py-3 rounded-xl border-none bg-primary-700 text-white text-[15px] font-bold cursor-pointer hover:bg-primary-800 transition disabled:opacity-60'>
                {isSubmitting ? '확인 중...' : '확인'}
              </button>
              <button type='button' onClick={onAdminCodeCancel} disabled={isSubmitting}
                className='w-full mt-2 py-2.5 rounded-xl border border-hairline bg-transparent text-ink-muted text-[13px] cursor-pointer hover:bg-canvas-soft transition disabled:opacity-60'>
                취소하고 다시 로그인
              </button>
            </form>
          )}

          {view === 'login' && (
            <form className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline' onSubmit={onLogin}>
              {info && <div className='text-emerald-600 text-[13px] mb-3 bg-emerald-50 rounded-lg px-3 py-2'>{info}</div>}
              <div className='text-[12px] text-ink-muted bg-canvas-soft rounded-lg px-3 py-2 mb-3'>
                💡 기본 비밀번호는 가입 시 등록한 전화번호입니다.
              </div>
              {popupSelectField}
              <input type='text' className={inputClass} value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loginPasswordRef.current?.focus() } }}
                placeholder='이메일 또는 이름' autoComplete='email' autoFocus />
              <input ref={loginPasswordRef} type='password' className={inputClass} value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)} placeholder='비밀번호' autoComplete='current-password' />
              {error && <div className='text-[#b42318] text-[13px] mb-3'>{error}</div>}
              <button type='submit' disabled={isSubmitting}
                className='w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mb-3'>
                {isSubmitting ? '로그인 중...' : '로그인'}
              </button>
              <p className='m-0 text-center text-[13px] text-ink-muted'>
                처음이라면?{' '}
                <button type='button' onClick={() => { setError(''); setInfo(''); setView('signup') }}
                  className='text-primary-700 font-semibold underline bg-transparent border-none cursor-pointer p-0'>
                  회원가입
                </button>
              </p>
            </form>
          )}

          {view === 'signup' && (
            <form className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline' onSubmit={onSignup}>
              <div className='text-[12px] text-ink-muted bg-canvas-soft rounded-lg px-3 py-2 mb-3'>
                💡 초기 비밀번호는 전화번호로 설정됩니다.
              </div>
              {popupSelectField}
              <input type='text' className={inputClass} value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupEmailRef.current?.focus() } }}
                placeholder='이름 *' autoFocus autoComplete='name' />
              <input ref={signupEmailRef} type='email' className={inputClass} value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupPhoneRef.current?.focus() } }}
                placeholder='이메일 *' autoComplete='email' />
              <input ref={signupPhoneRef} type='tel' className={inputClass} value={signupPhone}
                onChange={(e) => setSignupPhone(formatPhoneInput(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupBankNameRef.current?.focus() } }}
                placeholder='전화번호 * (초기 비밀번호)' autoComplete='tel' maxLength={13} />
              <input ref={signupBankNameRef} type='text' className={inputClass} value={signupBankName}
                onChange={(e) => setSignupBankName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupBankAccountRef.current?.focus() } }}
                placeholder='은행명 (선택)' />
              <input ref={signupBankAccountRef} type='text' inputMode='numeric' className={inputClass} value={signupBankAccount}
                onChange={(e) => setSignupBankAccount(formatBankAccountInput(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupResidentFrontRef.current?.focus() } }}
                maxLength={BANK_ACCOUNT_MAX_DIGITS}
                placeholder="계좌번호 (선택, '-' 없이 숫자만)" />

              <div className='flex items-center gap-2 mb-3'>
                <input ref={signupResidentFrontRef} type='text' inputMode='numeric' maxLength={6}
                  className={`${inputClass} mb-0 text-center tracking-wider`} value={signupResidentFront}
                  onChange={(e) => setSignupResidentFront(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupResidentBackRef.current?.focus() } }}
                  placeholder='주민번호 앞자리 *' autoComplete='off' />
                <span className='text-ink-faint'>-</span>
                <input ref={signupResidentBackRef} type='password' inputMode='numeric' maxLength={7}
                  className={`${inputClass} mb-0 text-center tracking-wider`} value={signupResidentBack}
                  onChange={(e) => setSignupResidentBack(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupInviteCodeRef.current?.focus() } }}
                  placeholder='뒷자리 *' autoComplete='off' />
              </div>

              <input ref={signupInviteCodeRef} type='text' className={inputClass} value={signupInviteCode}
                onChange={(e) => setSignupInviteCode(e.target.value)} placeholder='초대 코드 *' autoComplete='off' />

              {/* 개인정보 수집·이용 동의 */}
              <div className='mb-3 border border-hairline rounded-lg p-3 bg-canvas-soft'>
                <div className='flex items-start gap-2'>
                  <input
                    id='signup-consent'
                    type='checkbox'
                    checked={signupConsent}
                    onChange={(e) => setSignupConsent(e.target.checked)}
                    className='mt-0.5 cursor-pointer accent-primary-700'
                  />
                  <label htmlFor='signup-consent' className='text-[13px] text-ink cursor-pointer select-none'>
                    <span className='font-semibold'>[필수]</span> 개인정보 수집·이용에 동의합니다.{' '}
                    <button type='button' onClick={() => setShowPrivacyDetail(v => !v)}
                      className='text-primary-700 underline bg-transparent border-none cursor-pointer text-[12px] p-0'>
                      {showPrivacyDetail ? '접기' : '내용 보기'}
                    </button>
                  </label>
                </div>
                {showPrivacyDetail && (
                  <div className='mt-2 text-[11px] text-ink-muted leading-relaxed border-t border-hairline pt-2 space-y-1'>
                    <p className='m-0'><span className='font-semibold'>수집 항목:</span> 이름, 이메일, 전화번호, 계좌정보, 보건증 사본, 주민등록번호</p>
                    <p className='m-0'><span className='font-semibold'>수집 목적:</span> 근무 일정 관리, 급여 지급, 위생 관리(보건증 확인), 고용보험·산재보험 신고(주민등록번호)</p>
                    <p className='m-0'><span className='font-semibold'>주민등록번호 처리:</span> 4대보험 신고 목적으로만 사용하며 암호화하여 저장합니다. 관리자만 열람할 수 있고 열람 기록이 남습니다.</p>
                    <p className='m-0'><span className='font-semibold'>보유 기간:</span> 고용 관계 종료 후 1년</p>
                    <p className='m-0'><span className='font-semibold'>제3자 제공:</span> 없음</p>
                    <p className='m-0 text-[10px] text-ink-faint'>동의를 거부할 수 있으나, 거부 시 서비스 이용이 제한됩니다.</p>
                  </div>
                )}
              </div>

              <div className='mb-3'>
                <button type='button' onClick={() => fileInputRef.current?.click()}
                  className='w-full border border-dashed border-hairline rounded-lg px-3 py-2.5 text-[13px] text-ink-muted hover:border-primary-700 hover:text-primary-700 transition-colors bg-transparent cursor-pointer'>
                  {signupHealthCert ? `보건증: ${signupHealthCert.name}` : '보건증 사본 업로드 (선택)'}
                </button>
                <input ref={fileInputRef} type='file' accept='image/*,application/pdf' className='hidden'
                  onChange={(e) => setSignupHealthCert(e.target.files?.[0] ?? null)} />
              </div>

              {error && <div className='text-[#b42318] text-[13px] mb-3'>{error}</div>}
              <button type='submit' disabled={isSubmitting}
                className='w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mb-3'>
                {isSubmitting ? '가입 중...' : '회원가입'}
              </button>
              <button type='button' onClick={() => { setError(''); setView('login') }}
                className='w-full text-center text-[13px] text-ink-muted hover:text-primary-700 transition-colors bg-transparent border-none cursor-pointer'>
                이미 계정이 있으신가요? 로그인
              </button>
            </form>
          )}

        </div>
      </div>
    )
  }

  return <>{children}</>
}
