'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { fetchActivePopupEvents } from '@/app/actions/schedule'
import { createWorkerAccount, resolveLoginEmail } from '@/app/actions/workers'
import { isValidResidentRegistrationNumber } from '@/lib/resident-id'
import { formatPhoneInput, isValidKoreanPhone } from '@/lib/phone'
import { notifyLoginEvent } from '@/app/actions/discord'
import { withTimeout } from '@/lib/utils'
import LoadingScreen from '@/components/LoadingScreen'
import type { PopupEvent } from '@/types/database'

export const CASHIER_NAME_KEY = 'choichoi_cashier_name'
export const POPUP_ID_KEY = 'choichoi_popup_id'
export const POPUP_NAME_KEY = 'choichoi_popup_name'
export const WORKER_ROLE_KEY = 'choichoi_worker_role'
export const APP_ROLE_KEY = 'choichoi_app_role'

type View = 'login' | 'signup'

// popupId는 쿠키에도 병행 저장 — 서버 컴포넌트(pos·orders)가 요청 시점에 팝업을 알고 프리페치할 수 있게 함
export function setPopupIdCookie(popupId: string) {
  try { document.cookie = `${POPUP_ID_KEY}=${popupId}; path=/; max-age=31536000; samesite=lax` } catch { /* ignore */ }
}
export function clearPopupIdCookie() {
  try { document.cookie = `${POPUP_ID_KEY}=; path=/; max-age=0` } catch { /* ignore */ }
}

function clearStorage() {
  try {
    localStorage.removeItem(CASHIER_NAME_KEY)
    localStorage.removeItem(POPUP_ID_KEY)
    localStorage.removeItem(POPUP_NAME_KEY)
    localStorage.removeItem(WORKER_ROLE_KEY)
    localStorage.removeItem(APP_ROLE_KEY)
  } catch { /* ignore */ }
  clearPopupIdCookie()
}

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [checked, setChecked] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [view, setView] = useState<View>('login')
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
      if (localStorage.getItem(POPUP_ID_KEY)) { setIsAuthed(true); setChecked(true) }
    } catch { /* ignore */ }

    const checkAuth = async () => {
      // getSession()은 저장된 세션을 로컬에서 읽어 네트워크 왕복 없이 판정한다 (만료 시에만 갱신 요청)
      // 실제 권한 검증은 proxy.ts와 서버 액션이 담당하므로 이 게이트는 UX용 판정으로 충분
      const { data: { session } } = await supabase.auth.getSession()
      setIsAuthed(!!session && !!localStorage.getItem(POPUP_ID_KEY))
      setChecked(true)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setIsAuthed(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (pathname === '/display' || pathname === '/') return <>{children}</>
  if (!checked) return <LoadingScreen label="로그인 확인 중..." />

  const inputClass =
    'w-full border border-hairline rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3 bg-canvas'

  // 로그인 성공(비밀번호 로그인 또는 회원가입 직후 자동 로그인) 후 공통 후처리.
  // user_metadata.role 동기화(updateUser)는 화면 진입을 막지 않는다 — proxy.ts/서버 액션이 실제 권한 검사를
  // 최종 담당하므로(CLAUDE.md 참고) 이 동기화가 한 박자 늦게 끝나도 안전하고, every-login 체감 지연만 늘어들 뿐이었다.
  const finishAuth = async (user: { id: string; user_metadata?: { name?: string } }, email: string) => {
    const supabase = createSupabaseBrowserClient()

    // user_profiles에서 이름 + role 조회 — localStorage 기록(캐셔 이름 등)에 필요하므로 이것만 기다린다
    const { data: profile } = await withTimeout(
      Promise.resolve(supabase.from('user_profiles').select('name, worker_role').eq('id', user.id).maybeSingle()),
      8000,
      '프로필 조회',
    )

    const syncedRole =
      profile?.worker_role === 'admin' ? 'admin' :
      profile?.worker_role === 'manager' ? 'manager' : 'user'
    // user_metadata.role 동기화는 백그라운드로 — 실패해도 로그인을 막지 않는다
    supabase.auth.updateUser({
      data: { role: syncedRole, name: profile?.name ?? user.user_metadata?.name },
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

      await finishAuth(data.user, resolved.data.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPopupId) { setError('근무지를 선택해주세요.'); return }
    if (!signupName.trim()) { setError('이름을 입력해주세요.'); return }
    if (!signupEmail.trim()) { setError('이메일을 입력해주세요.'); return }
    if (!signupPhone.trim()) { setError('전화번호를 입력해주세요. (초기 비밀번호로 사용됩니다)'); return }
    if (!isValidKoreanPhone(signupPhone)) { setError('전화번호 자리수를 확인해주세요. (예: 010-1234-5678)'); return }
    if (!signupInviteCode.trim()) { setError('초대 코드를 입력해주세요.'); return }
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
    const password = signupPhone.trim()

    // 서버 액션: 초대코드 검증 + 계정 생성 + 프로필 INSERT (이메일 발송 없음)
    const result = await createWorkerAccount({
      inviteCode: signupInviteCode,
      email,
      password,
      name: signupName.trim(),
      phone: signupPhone.trim(),
      bankName: signupBankName.trim() || undefined,
      bankAccount: signupBankAccount.trim() || undefined,
      residentIdFront: residentFront,
      residentIdBack: residentBack,
    })

    if (!result.success) {
      setError(result.error ?? '회원가입 중 오류가 발생했습니다.')
      setIsSubmitting(false)
      return
    }

    // 보건증 업로드 (선택, 클라이언트 스토리지)
    const supabase = createSupabaseBrowserClient()
    if (signupHealthCert && result.data?.userId) {
      const ext = signupHealthCert.name.split('.').pop()
      const path = `${result.data.userId}/health_cert.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('health-certs')
        .upload(path, signupHealthCert, { upsert: true })
      if (uploadError) {
        console.error('[signup] 보건증 업로드 실패:', uploadError.message)
      } else {
        const { data: urlData } = supabase.storage.from('health-certs').getPublicUrl(path)
        await supabase.from('user_profiles').update({ health_cert_url: urlData.publicUrl }).eq('id', result.data.userId)
      }
    }

    // 가입 직후 자동 로그인 (방금 만든 계정 이메일 + 초기 비밀번호로 즉시 세션 발급)
    const { data, error: authError } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      8000,
      '로그인',
    )

    setIsSubmitting(false)

    if (authError || !data.user) {
      // 자동 로그인만 실패한 경우 — 계정은 이미 생성됐으므로 로그인 화면으로 안내
      setInfo(`가입 완료! 초기 비밀번호는 전화번호(${password})입니다. 로그인해주세요.`)
      setView('login')
      setSignupName(''); setSignupEmail(''); setSignupPhone('')
      setSignupBankName(''); setSignupBankAccount(''); setSignupResidentFront(''); setSignupResidentBack('')
      setSignupHealthCert(null); setSignupInviteCode(''); setSignupConsent(false)
      return
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
              {view === 'login' ? '직원 계정으로 로그인해주세요.' : '처음 오셨다면 직원 계정을 만들어주세요.'}
            </p>
          </div>

          {view === 'login' && (
            <form className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline' onSubmit={onLogin}>
              {info && <div className='text-emerald-600 text-[13px] mb-3 bg-emerald-50 rounded-lg px-3 py-2'>{info}</div>}
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
              <input ref={signupBankAccountRef} type='text' className={inputClass} value={signupBankAccount}
                onChange={(e) => setSignupBankAccount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signupResidentFrontRef.current?.focus() } }}
                placeholder='계좌번호 (선택)' />

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
