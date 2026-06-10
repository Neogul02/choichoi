'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { usePathname, useRouter } from 'next/navigation'
import { fetchPopupEvents } from '@/app/actions/schedule'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { PopupEvent } from '@/types/database'

const AUTH_KEY = 'choichoi_popup_token'
const CASHIER_NAME_KEY = 'choichoi_cashier_name'
const POPUP_ID_KEY = 'choichoi_popup_id'
const POPUP_NAME_KEY = 'choichoi_popup_name'
const VALIDATE_API_PATH = '/api/auth/verify/validate'

export { POPUP_ID_KEY, POPUP_NAME_KEY }

type Tab = 'staff' | 'admin'

function clearStaffStorage() {
  try {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem(CASHIER_NAME_KEY)
    localStorage.removeItem(POPUP_ID_KEY)
    localStorage.removeItem(POPUP_NAME_KEY)
  } catch {
    /* ignore */
  }
}

export default function PasswordGate({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const [checked, setChecked] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [tab, setTab] = useState<Tab>('staff')

  // Staff fields
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [popupEvents, setPopupEvents] = useState<PopupEvent[]>([])
  const [selectedPopupId, setSelectedPopupId] = useState<number | ''>('')

  // Admin fields
  const [email, setEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      // 1. Supabase 세션 확인 (관리자)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        setIsAuthed(true)
        setChecked(true)
        return
      }

      // 2. 직원 토큰 확인
      const storedToken = localStorage.getItem(AUTH_KEY)
      if (!storedToken) {
        setChecked(true)
        return
      }

      try {
        const { data } = await axios.post(VALIDATE_API_PATH, {
          token: storedToken,
        })
        if (data.valid) {
          setIsAuthed(true)
        } else {
          clearStaffStorage()
        }
      } catch {
        clearStaffStorage()
      }
      setChecked(true)
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) setIsAuthed(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  // 인증 불필요 경로
  if (pathname === '/display' || pathname === '/') return <>{children}</>

  if (!checked) return null

  // 직원 로그인
  const onSubmitStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedPopupId) {
      setError('팝업을 선택해주세요.')
      return
    }
    if (!name.trim()) {
      setError('이름을 입력해주세요.')
      return
    }
    if (!password) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const { data } = await axios.post('/api/auth/verify', { password })
      if (!data.success) {
        setError(data.message || '비밀번호가 올바르지 않습니다.')
        setIsSubmitting(false)
        return
      }
      const popup = popupEvents.find((p) => p.id === selectedPopupId)
      localStorage.setItem(AUTH_KEY, data.token)
      localStorage.setItem(CASHIER_NAME_KEY, name.trim())
      localStorage.setItem(POPUP_ID_KEY, String(selectedPopupId))
      localStorage.setItem(POPUP_NAME_KEY, popup?.name ?? '')
      setIsAuthed(true)
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message
        : undefined
      setError(msg || '검증 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 관리자 로그인
  const onSubmitAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedPopupId) {
      setError('팝업을 선택해주세요.')
      return
    }
    if (!name.trim()) {
      setError('이름을 입력해주세요.')
      return
    }
    if (!email.trim()) {
      setError('이메일을 입력해주세요.')
      return
    }
    if (!adminPassword) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    setError('')
    setIsSubmitting(true)

    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: adminPassword,
    })

    if (authError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
      setIsSubmitting(false)
      return
    }

    const popup = popupEvents.find((p) => p.id === selectedPopupId)
    localStorage.setItem(CASHIER_NAME_KEY, name.trim())
    localStorage.setItem(POPUP_ID_KEY, String(selectedPopupId))
    localStorage.setItem(POPUP_NAME_KEY, popup?.name ?? '')

    setIsAuthed(true)
    router.push('/pos') // 로그인 후 POS로 이동
    router.refresh()
  }

  if (!isAuthed) {
    const inputClass =
      'w-full border border-hairline rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-700/15 mb-3 bg-canvas'

    return (
      <div className='min-h-screen bg-[#f5f6f7] flex items-center justify-center p-4'>
        <div className='w-full max-w-[360px]'>
          {/* 탭 토글 */}
          <div className='flex rounded-xl overflow-hidden border border-hairline mb-5 bg-canvas shadow-level-1'>
            {(['staff', 'admin'] as Tab[]).map((t) => (
              <button
                key={t}
                type='button'
                onClick={() => {
                  setTab(t)
                  setError('')
                  setPassword('')
                  setAdminPassword('')
                }}
                className={`flex-1 py-2.5 text-[13px] font-bold border-none cursor-pointer transition ${tab === t ? 'bg-primary-700 text-white' : 'bg-canvas text-ink-muted hover:bg-canvas-soft'}`}
              >
                {t === 'staff' ? '일반' : '관리자'}
              </button>
            ))}
          </div>

          <div className='text-center mb-5'>
            <h1 className='text-2xl font-black text-ink m-0 mb-1'>
              ChoiChoi POS
            </h1>
            <p className='m-0 text-ink-muted text-sm'>
              {tab === 'staff'
                ? '운영 화면 접근을 위해 정보를 입력해주세요.'
                : '관리자 계정으로 로그인해주세요.'}
            </p>
          </div>

          {tab === 'staff' ? (
            <form
              className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline'
              onSubmit={onSubmitStaff}
            >
              <div className='relative mb-3'>
                <select
                  className={`${inputClass} mb-0 appearance-none pr-8 cursor-pointer ${!selectedPopupId ? 'text-ink-faint' : 'text-ink'} ${popupEvents.length === 1 ? 'opacity-70 cursor-default' : ''}`}
                  value={selectedPopupId}
                  onChange={(e) =>
                    setSelectedPopupId(
                      e.target.value ? Number(e.target.value) : '',
                    )
                  }
                  disabled={popupEvents.length === 1}
                >
                  <option value=''>팝업 선택</option>
                  {popupEvents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint'>
                  <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                    <path
                      d='M2 4l4 4 4-4'
                      stroke='currentColor'
                      strokeWidth='1.5'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                </span>
              </div>
              <input
                type='text'
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='이름'
                autoFocus={popupEvents.length === 1}
                autoComplete='name'
              />
              <input
                type='password'
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='비밀번호'
                autoComplete='current-password'
              />
              {error && (
                <div className='text-[#b42318] text-[13px] mb-3'>{error}</div>
              )}
              <button
                type='submit'
                className='w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                disabled={isSubmitting}
              >
                {isSubmitting ? '확인 중...' : '입장하기'}
              </button>
            </form>
          ) : (
            <form
              className='bg-canvas rounded-xl p-5 shadow-level-1 border border-hairline'
              onSubmit={onSubmitAdmin}
            >
              <div className='relative mb-3'>
                <select
                  className={`${inputClass} mb-0 appearance-none pr-8 cursor-pointer ${!selectedPopupId ? 'text-ink-faint' : 'text-ink'} ${popupEvents.length === 1 ? 'opacity-70 cursor-default' : ''}`}
                  value={selectedPopupId}
                  onChange={(e) =>
                    setSelectedPopupId(
                      e.target.value ? Number(e.target.value) : '',
                    )
                  }
                  disabled={popupEvents.length === 1}
                >
                  <option value=''>팝업 선택</option>
                  {popupEvents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint'>
                  <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                    <path
                      d='M2 4l4 4 4-4'
                      stroke='currentColor'
                      strokeWidth='1.5'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                </span>
              </div>
              <input
                type='text'
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='이름'
                autoComplete='name'
              />
              <input
                type='email'
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder='이메일'
                autoFocus
                autoComplete='email'
              />
              <input
                type='password'
                className={inputClass}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder='비밀번호'
                autoComplete='current-password'
              />
              {error && (
                <div className='text-[#b42318] text-[13px] mb-3'>{error}</div>
              )}
              <button
                type='submit'
                className='w-full border-none rounded-lg px-3 py-2.5 text-[14px] font-bold bg-primary-700 text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed'
                disabled={isSubmitting}
              >
                {isSubmitting ? '로그인 중...' : '관리자 로그인'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
