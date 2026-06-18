'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { fetchPopupEvents } from '@/app/actions/schedule'
import { createWorkerAccount, resolveLoginEmail } from '@/app/actions/workers'
import { notifyLoginEvent } from '@/app/actions/discord'
import type { PopupEvent } from '@/types/database'

export const CASHIER_NAME_KEY = 'choichoi_cashier_name'
export const POPUP_ID_KEY = 'choichoi_popup_id'
export const POPUP_NAME_KEY = 'choichoi_popup_name'

type View = 'login' | 'signup'

function clearStorage() {
  try {
    localStorage.removeItem(CASHIER_NAME_KEY)
    localStorage.removeItem(POPUP_ID_KEY)
    localStorage.removeItem(POPUP_NAME_KEY)
  } catch { /* ignore */ }
}

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [checked, setChecked] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [view, setView] = useState<View>('login')
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([])
  const [selectedPopupId, setSelectedPopupId] = useState<number | ''>('')

  // 로그인 필드
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // 회원가입 필드 (비번 없음 — 초기 비번 = 전화번호)
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupBankName, setSignupBankName] = useState('')
  const [signupBankAccount, setSignupBankAccount] = useState('')
  const [signupHealthCert, setSignupHealthCert] = useState<File | null>(null)
  const [signupInviteCode, setSignupInviteCode] = useState('')
  const [signupConsent, setSignupConsent] = useState(false)
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false)

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPopupEvents().then((result) => {
      if (result.success && result.data) {
        setPopupEvents(result.data)
        if (result.data.length === 1) setSelectedPopupId(result.data[0].id)
      }
    })
  }, [])

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && localStorage.getItem(POPUP_ID_KEY)) setIsAuthed(true)
      setChecked(true)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setIsAuthed(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (pathname === '/display' || pathname === '/') return <>{children}</>
  if (!checked) return null

  const inputClass =
    'w-full border border-hairline rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3 bg-canvas'

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPopupId) { setError('팝업을 선택해주세요.'); return }
    if (!loginEmail.trim() || !loginPassword) {
      setError('이메일(또는 이름)과 비밀번호를 입력해주세요.')
      return
    }
    setError('')
    setIsSubmitting(true)

    try {
      const resolved = await resolveLoginEmail(loginEmail.trim())
      if (!resolved.success || !resolved.data) {
        setError(resolved.error ?? '계정을 찾을 수 없습니다.')
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: resolved.data.email,
        password: loginPassword,
      })

      if (authError || !data.user) {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.')
        return
      }

      // user_profiles에서 이름 + role 조회 → user_metadata 동기화
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('name, worker_role')
        .eq('id', data.user.id)
        .maybeSingle()

      const isAdmin = profile?.worker_role === 'admin'
      await supabase.auth.updateUser({
        data: { role: isAdmin ? 'admin' : 'worker', name: profile?.name ?? data.user.user_metadata?.name },
      })

      const name = profile?.name ?? data.user.user_metadata?.name ?? ''
      const popup = popupEvents.find((p) => p.id === selectedPopupId)
      try {
        if (name) localStorage.setItem(CASHIER_NAME_KEY, name)
        localStorage.setItem(POPUP_ID_KEY, String(selectedPopupId))
        localStorage.setItem(POPUP_NAME_KEY, popup?.name ?? '')
      } catch { /* ignore */ }

      notifyLoginEvent(name, resolved.data.email).catch(() => {})
      setIsAuthed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signupName.trim()) { setError('이름을 입력해주세요.'); return }
    if (!signupEmail.trim()) { setError('이메일을 입력해주세요.'); return }
    if (!signupPhone.trim()) { setError('전화번호를 입력해주세요. (초기 비밀번호로 사용됩니다)'); return }
    if (!signupInviteCode.trim()) { setError('초대 코드를 입력해주세요.'); return }
    if (!signupConsent) { setError('개인정보 수집·이용에 동의해주세요.'); return }

    setError('')
    setIsSubmitting(true)

    // 서버 액션: 초대코드 검증 + 계정 생성 + 프로필 INSERT (이메일 발송 없음)
    const result = await createWorkerAccount({
      inviteCode: signupInviteCode,
      email: signupEmail.trim(),
      password: signupPhone.trim(),
      name: signupName.trim(),
      phone: signupPhone.trim(),
      bankName: signupBankName.trim() || undefined,
      bankAccount: signupBankAccount.trim() || undefined,
    })

    if (!result.success) {
      setError(result.error ?? '회원가입 중 오류가 발생했습니다.')
      setIsSubmitting(false)
      return
    }

    // 보건증 업로드 (선택, 클라이언트 스토리지)
    if (signupHealthCert && result.data?.userId) {
      const supabase = createSupabaseBrowserClient()
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

    setIsSubmitting(false)
    setInfo(`가입 완료! 초기 비밀번호는 전화번호(${signupPhone.trim()})입니다.`)
    setView('login')
    setSignupName(''); setSignupEmail(''); setSignupPhone('')
    setSignupBankName(''); setSignupBankAccount(''); setSignupHealthCert(null); setSignupInviteCode(''); setSignupConsent(false)
  }


  if (!isAuthed) {
    return (
      <div className='min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4'>
        <div className='w-full max-w-[360px]'>
          <div className='text-center mb-5'>
            <h1 className='text-2xl font-black text-ink m-0 mb-1'>ChoiChoi POS</h1>
            <p className='m-0 text-ink-muted text-sm'>
              {view === 'login' ? '로그인하여 시작하세요.' : '새 계정을 만들어 팀에 합류하세요.'}
            </p>
          </div>

          {view === 'login' && (
            <form className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline' onSubmit={onLogin}>
              {info && <div className='text-emerald-600 text-[13px] mb-3 bg-emerald-50 rounded-lg px-3 py-2'>{info}</div>}
              <div className='relative mb-3'>
                <select
                  className={`${inputClass} mb-0 appearance-none pr-8 cursor-pointer ${!selectedPopupId ? 'text-ink-faint' : 'text-ink'} ${popupEvents.length === 1 ? 'opacity-70 cursor-default' : ''}`}
                  value={selectedPopupId}
                  onChange={(e) => setSelectedPopupId(e.target.value ? Number(e.target.value) : '')}
                  disabled={popupEvents.length === 1}
                >
                  <option value=''>팝업 선택</option>
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
              <input type='text' className={inputClass} value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)} placeholder='이메일 또는 이름' autoComplete='email' />
              <input type='password' className={inputClass} value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)} placeholder='비밀번호' autoComplete='current-password' />
              {error && <div className='text-[#b42318] text-[13px] mb-3'>{error}</div>}
              <button type='submit' disabled={isSubmitting}
                className='w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mb-3'>
                {isSubmitting ? '로그인 중...' : '로그인'}
              </button>
              <button type='button' onClick={() => { setError(''); setInfo(''); setView('signup') }}
                className='w-full text-center text-[13px] text-ink-muted hover:text-primary-700 transition-colors bg-transparent border-none cursor-pointer'>
                처음이신가요? 회원가입
              </button>
            </form>
          )}

          {view === 'signup' && (
            <form className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline' onSubmit={onSignup}>
              <div className='text-[12px] text-ink-muted bg-canvas-soft rounded-lg px-3 py-2 mb-3'>
                💡 초기 비밀번호는 전화번호로 설정됩니다.
              </div>
              <input type='text' className={inputClass} value={signupName}
                onChange={(e) => setSignupName(e.target.value)} placeholder='이름 *' autoFocus autoComplete='name' />
              <input type='email' className={inputClass} value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)} placeholder='이메일 *' autoComplete='email' />
              <input type='tel' className={inputClass} value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)} placeholder='전화번호 * (초기 비밀번호)' autoComplete='tel' />
              <input type='text' className={inputClass} value={signupBankName}
                onChange={(e) => setSignupBankName(e.target.value)} placeholder='은행명 (선택)' />
              <input type='text' className={inputClass} value={signupBankAccount}
                onChange={(e) => setSignupBankAccount(e.target.value)} placeholder='계좌번호 (선택)' />

              <input type='text' className={inputClass} value={signupInviteCode}
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
                    <p className='m-0'><span className='font-semibold'>수집 항목:</span> 이름, 이메일, 전화번호, 계좌정보, 보건증 사본</p>
                    <p className='m-0'><span className='font-semibold'>수집 목적:</span> 근무 일정 관리, 급여 지급, 위생 관리(보건증 확인)</p>
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
