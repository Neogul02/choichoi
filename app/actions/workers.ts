'use server'

import { after } from 'next/server'

// 파일명은 레거시 workers 테이블(2026-07-20 삭제, 코드 참조 0건 확인 후 제거)에서 유래.
// 실제로는 user_profiles 기반 계정 관리 액션 — staff_profiles(근무자 프로필)와는 별개.
import { supabaseAdmin } from '@/lib/supabase-admin-client'
import { getAuthUser, isNextInternalControlFlowError, requireAdmin, wrap } from './_base'
import { utcToKstDateStr } from '@/lib/date'
import { encryptResidentId, decryptResidentId } from '@/lib/pii-crypto'
import { isValidResidentRegistrationNumber, maskResidentId } from '@/lib/resident-id'
import { isValidKoreanPhone, normalizePhone } from '@/lib/phone'
import { isValidBankAccount, normalizeBankAccount, BANK_ACCOUNT_RULE_MESSAGE } from '@/lib/bank'
import type { ApiResponse } from '@/types/api'
import type { UserAppRole } from '@/types/database'

const USER_PROFILE_COLUMNS = 'id, name, phone, bank_name, bank_account, health_cert_url, worker_role, resident_reg_no_masked, created_at'

export interface UserProfile {
  id: string
  name: string
  phone: string | null
  bank_name: string | null
  bank_account: string | null
  health_cert_url: string | null
  worker_role: string
  resident_reg_no_masked: string | null
  /** 가입 시각 — 유저관리의 가입순 정렬에 쓴다 */
  created_at: string | null
}

export async function getMyProfile(): Promise<ApiResponse<UserProfile>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: '프로필 없음' }
    return { success: true, data: data as UserProfile }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}


export interface DailyOrderStat {
  date: string
  orders: number
  revenue: number
}

export interface PopupOrderStat {
  popupId: number
  popupName: string
  orders: number
  revenue: number
  daily: DailyOrderStat[]
  byPaymentMethod: Record<string, { orders: number; revenue: number }>
}

export interface MyOrderStats {
  totalOrders: number
  totalRevenue: number
  byPopup: PopupOrderStat[]
}

async function computeOrderStatsForCashierName(cashierName: string): Promise<MyOrderStats> {
  // 1000건 제한 우회: 페이지네이션으로 전체 로드. 팝업 목록은 주문 페이지네이션과 무관하므로 병렬 실행해 왕복을 줄인다.
  const PAGE = 1000
  async function loadAllOrders() {
    let allOrders: { id: number; total_price: number; payment_method: string | null; created_at: string; popup_id: number | null }[] = []
    for (let page = 0; ; page++) {
      const { data, error: err } = await supabaseAdmin
        .from('orders')
        .select('id, total_price, payment_method, created_at, popup_id')
        .eq('cashier_name', cashierName)
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: true })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (err) throw new Error(err.message)
      if (!data || data.length === 0) break
      allOrders = allOrders.concat(data)
      if (data.length < PAGE) break
    }
    return allOrders
  }

  const [allOrders, { data: popups }] = await Promise.all([
    loadAllOrders(),
    supabaseAdmin.from('popup_events').select('id, name, start_date, end_date').order('start_date', { ascending: true }),
  ])

  if (allOrders.length === 0) {
    return { totalOrders: 0, totalRevenue: 0, byPopup: [] }
  }

  // 팝업별 버킷 초기화
  const popupBuckets = new Map<number, PopupOrderStat>()
  for (const p of (popups ?? [])) {
    popupBuckets.set(p.id, {
      popupId: p.id,
      popupName: p.name,
      orders: 0,
      revenue: 0,
      daily: [],
      byPaymentMethod: {},
    })
  }
  // 미분류용 버킷
  const unclassified: PopupOrderStat = {
    popupId: 0,
    popupName: '미분류',
    orders: 0,
    revenue: 0,
    daily: [],
    byPaymentMethod: {},
  }

  const byDate = new Map<number, Record<string, DailyOrderStat>>()

  for (const o of allOrders) {
    // KST 날짜 계산 (created_at은 timezone 없는 UTC timestamp)
    const date = utcToKstDateStr(o.created_at)

    // popup_id 직접 사용 (없으면 날짜로 fallback)
    let bucketId: number = 0
    if (o.popup_id) {
      bucketId = o.popup_id
    } else {
      const popup = (popups ?? []).find((p) => date >= p.start_date && date <= p.end_date)
      bucketId = popup?.id ?? 0
    }

    const bucket = bucketId !== 0 ? popupBuckets.get(bucketId) : undefined
    const target = bucket ?? unclassified

    target.orders++
    target.revenue += o.total_price

    const m = o.payment_method ?? '기타'
    if (!target.byPaymentMethod[m]) target.byPaymentMethod[m] = { orders: 0, revenue: 0 }
    target.byPaymentMethod[m].orders++
    target.byPaymentMethod[m].revenue += o.total_price

    if (!byDate.has(bucketId)) byDate.set(bucketId, {})
    const dateMap = byDate.get(bucketId)!
    if (!dateMap[date]) dateMap[date] = { date, orders: 0, revenue: 0 }
    dateMap[date].orders++
    dateMap[date].revenue += o.total_price
  }

  // daily 배열 합치기
  for (const [bucketId, dateMap] of byDate) {
    const bucket = bucketId === 0 ? unclassified : popupBuckets.get(bucketId)
    if (bucket) bucket.daily = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  }

  const byPopup = [
    ...[...popupBuckets.values()].filter((b) => b.orders > 0),
    ...(unclassified.orders > 0 ? [unclassified] : []),
  ]

  return {
    totalOrders: allOrders.length,
    totalRevenue: allOrders.reduce((s, o) => s + o.total_price, 0),
    byPopup,
  }
}

export async function getMyOrderStats(): Promise<ApiResponse<MyOrderStats>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()

    const cashierName = profile?.name ?? user.user_metadata?.name
    if (!cashierName) return { success: false, error: '프로필 없음' }

    const data = await computeOrderStatsForCashierName(cashierName)
    return { success: true, data }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/** 관리자가 MY 페이지에서 다른 근무자의 판매 통계를 조회 */
export async function getOrderStatsAsAdmin(userId: string): Promise<ApiResponse<MyOrderStats>> {
  try {
    const admin = await getAuthUser()
    if (!admin || admin.role !== 'admin') return { success: false, error: '권한이 없습니다.' }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle()
    if (!profile?.name) return { success: false, error: '프로필 없음' }

    const data = await computeOrderStatsForCashierName(profile.name)
    return { success: true, data }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/** 관리자가 MY 페이지에서 다른 근무자의 프로필을 조회 */
export async function getUserProfileAsAdmin(userId: string): Promise<ApiResponse<UserProfile>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('프로필 없음')
    return data as UserProfile
  })
}

export interface UpdateProfileInput {
  name?: string
  email?: string
  phone?: string
  bankName?: string
  bankAccount?: string
  healthCertUrl?: string
}

export async function updateMyProfile(input: UpdateProfileInput): Promise<ApiResponse> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const updates: Record<string, string | null> = {}
    if (input.name !== undefined) updates.name = input.name || null
    if (input.phone !== undefined) {
      const phone = normalizePhone(input.phone)
      if (phone && !isValidKoreanPhone(phone)) return { success: false, error: '전화번호 형식이 올바르지 않습니다. (예: 010-1234-5678)' }
      updates.phone = phone || null
    }
    if (input.bankName !== undefined) updates.bank_name = input.bankName?.trim() || null
    if (input.bankAccount !== undefined) {
      const account = normalizeBankAccount(input.bankAccount)
      if (account && !isValidBankAccount(account)) return { success: false, error: BANK_ACCOUNT_RULE_MESSAGE }
      updates.bank_account = account || null
    }
    if (input.healthCertUrl !== undefined) updates.health_cert_url = input.healthCertUrl || null

    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) return { success: false, error: error.message }

    // Auth 업데이트 (이름, 이메일)
    const authUpdates: { email?: string; user_metadata?: Record<string, unknown> } = {}
    if (input.email && input.email !== user.email) authUpdates.email = input.email
    if (input.name) authUpdates.user_metadata = { ...user.user_metadata, name: input.name }
    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, authUpdates)
      if (authError) return { success: false, error: authError.message }
    }

    return { success: true }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }
    if (!user.email) return { success: false, error: '이메일 계정이 없습니다.' }

    // 현재 비밀번호 검증
    const { createClient } = await import('@supabase/supabase-js')
    const verify = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error: signInError } = await verify.auth.signInWithPassword({ email: user.email, password: currentPassword })
    if (signInError) return { success: false, error: '현재 비밀번호가 틀렸습니다.' }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password: newPassword })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export async function resolveLoginEmail(identifier: string): Promise<ApiResponse<{ email: string }>> {
  try {
    const trimmed = identifier.trim()
    if (!trimmed) return { success: false, error: '이메일 또는 이름을 입력해주세요.' }
    if (trimmed.includes('@')) return { success: true, data: { email: trimmed } }

    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('name', trimmed)

    if (error) return { success: false, error: error.message }
    if (!profiles || profiles.length === 0) return { success: false, error: '해당 이름의 계정을 찾을 수 없습니다.' }
    if (profiles.length > 1) return { success: false, error: '동일한 이름의 계정이 여러 개입니다. 이메일로 로그인해주세요.' }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profiles[0].id)
    if (userError || !userData.user?.email) return { success: false, error: '계정 정보를 불러올 수 없습니다.' }

    return { success: true, data: { email: userData.user.email } }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export interface CreateWorkerAccountInput {
  inviteCode: string
  email: string
  /** 초기 비밀번호는 받지 않는다 — 서버가 정규화한 전화번호에서 직접 파생한다 */
  name: string
  phone: string
  bankName?: string
  bankAccount?: string
  residentIdFront: string
  residentIdBack: string
}

/**
 * 근무지(팝업) 접근 권한 검증 — 인사탭에서 그 팝업에 배정해둔 캐셔만 그 팝업으로 로그인된다.
 *
 * 주방은 누구나 들어갈 수 있다(운영 방침). 관리자·매니저는 전 팝업을 오가야 하므로 통과시킨다.
 * 배정 판정은 staff_profiles.popup_id(현재 소속)와 staff_popup_assignments(겸직·이력) 둘 다 본다 —
 * 한 캐셔가 여러 팝업을 오가는 경우가 실제로 있어서 한쪽만 보면 멀쩡한 사람이 잠긴다.
 *
 * 로그인 직후, 화면을 열어주기 전에 호출한다. 판정은 전부 서버에서 한다.
 */
export async function checkPopupAccess(
  popupId: number | null,
): Promise<ApiResponse<{ allowed: boolean }>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    // 주방(popupId null)은 제한 없음
    if (popupId == null) return { success: true, data: { allowed: true } }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('worker_role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.worker_role === 'admin' || profile?.worker_role === 'manager') {
      return { success: true, data: { allowed: true } }
    }

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from('staff_profiles')
      .select('id, name, popup_id, staff_role, popup_events(name)')
      .eq('user_profile_id', user.id)
    if (staffError) throw new Error(staffError.message)

    const profiles = staffRows ?? []
    if (profiles.some(p => p.popup_id === popupId)) return { success: true, data: { allowed: true } }

    // 겸직은 N:M 테이블에만 있을 수 있다
    const staffIds = profiles.map(p => p.id)
    if (staffIds.length > 0) {
      const { data: assigned } = await supabaseAdmin
        .from('staff_popup_assignments')
        .select('popup_id')
        .in('staff_id', staffIds)
        .eq('popup_id', popupId)
      if ((assigned ?? []).length > 0) return { success: true, data: { allowed: true } }
    }

    // 어디로 가야 하는지 알려준다 — 그냥 "권한 없음"만 띄우면 현장에서 문의가 몰린다
    const mine = profiles
      .map(p => (Array.isArray(p.popup_events) ? p.popup_events[0] : p.popup_events) as { name: string } | null)
      .map(e => e?.name)
      .filter((n): n is string => !!n)
    const hint = mine.length > 0 ? ` 배정된 근무지는 ${[...new Set(mine)].join(', ')}입니다.` : ''
    return { success: false, error: `이 근무지에 배정되어 있지 않습니다.${hint}` }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/**
 * 관리자 2차 코드 검증 — 비밀번호만으로는 관리자 화면에 들어오지 못하게 한다.
 *
 * 로그인(signInWithPassword) 직후, 아직 화면을 열어주기 전에 호출한다.
 * code 없이 부르면 "코드가 필요한 계정인지"만 알려주고, code를 주면 맞는지 판정한다.
 * 역할 판정과 코드 비교는 전부 서버에서 한다 — 코드 값이 브라우저 번들에 실리면 의미가 없다.
 *
 * ADMIN_LOGIN_CODE가 설정돼 있지 않으면 게이트를 끈 것으로 본다.
 * 미설정을 "항상 실패"로 다루면 환경변수를 빠뜨린 배포에서 관리자 둘 다 영영 못 들어온다.
 */
export async function checkAdminLoginCode(
  code?: string | null,
): Promise<ApiResponse<{ required: boolean; verified: boolean }>> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('worker_role')
      .eq('id', user.id)
      .maybeSingle()

    const expected = process.env.ADMIN_LOGIN_CODE?.trim()
    const isAdmin = profile?.worker_role === 'admin'
    if (!isAdmin || !expected) return { success: true, data: { required: false, verified: true } }

    if (code == null) return { success: true, data: { required: true, verified: false } }
    if (code.trim() !== expected) return { success: false, error: '관리자 코드가 올바르지 않습니다.' }

    return { success: true, data: { required: true, verified: true } }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export async function createWorkerAccount(
  input: CreateWorkerAccountInput,
): Promise<ApiResponse<{ userId: string }>> {
  try {
    // 1. 초대 코드 검증
    const expected = process.env.SIGNUP_CODE
    if (!expected || input.inviteCode.trim() !== expected.trim()) {
      return { success: false, error: '초대 코드가 올바르지 않습니다.' }
    }

    // 1-1. 주민등록번호 형식·체크섬 검증 — 고용/산재보험 신고 목적, 오탈자로 인한 잘못된 신고 방지
    const residentFront = input.residentIdFront.trim()
    const residentBack = input.residentIdBack.trim()
    if (!isValidResidentRegistrationNumber(residentFront, residentBack)) {
      return { success: false, error: '주민등록번호가 올바르지 않습니다.' }
    }

    // 1-2. 전화번호 정규화 강제 — 초기 비밀번호가 곧 전화번호이므로 저장 형식이 흔들리면 로그인 불능이 된다.
    //      클라이언트를 우회해 직접 호출하더라도 여기서 막힌다.
    const phone = normalizePhone(input.phone)
    if (!isValidKoreanPhone(phone)) {
      return { success: false, error: '전화번호 형식이 올바르지 않습니다. 0으로 시작하는 국내 번호를 입력해주세요. (예: 010-1234-5678)' }
    }
    // 비밀번호는 클라이언트가 보낸 값이 아니라 정규화된 전화번호로 고정한다
    const password = phone

    // 1-3. 계좌번호도 숫자만으로 강제 — 하이픈이 섞이면 송금 붙여넣기가 깨지고 같은 계좌가 중복 저장된다
    const bankAccount = normalizeBankAccount(input.bankAccount)
    if (bankAccount && !isValidBankAccount(bankAccount)) {
      return { success: false, error: BANK_ACCOUNT_RULE_MESSAGE }
    }

    // 2. admin API로 유저 생성 (이메일 인증 메일 없음, rate limit 없음)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email.trim(),
      password,
      email_confirm: true,
      user_metadata: { role: 'user', name: input.name.trim() },
    })

    if (authError || !authData.user) {
      const msg = authError?.message ?? '계정 생성 실패'
      if (msg.includes('already been registered') || msg.includes('already registered')) {
        return { success: false, error: '이미 가입된 이메일입니다.' }
      }
      return { success: false, error: `계정 생성 오류: ${msg}` }
    }

    const userId = authData.user.id

    // 3. user_profiles INSERT
    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert([{
      id: userId,
      name: input.name.trim(),
      phone,
      bank_name: input.bankName?.trim() || null,
      bank_account: bankAccount || null,
      worker_role: 'user',
      resident_reg_no_enc: encryptResidentId(`${residentFront}${residentBack}`),
      resident_reg_no_masked: maskResidentId(residentFront, residentBack),
    }])

    if (profileError) {
      // 프로필 실패 시 생성된 auth 유저도 정리
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { success: false, error: `프로필 저장 실패: ${profileError.message}` }
    }

    // 인사관리(staff_profiles)에 같은 이름의 미연결 프로필이 있으면 자동 연결
    // → 가입 즉시 마이페이지에서 본인 근무 일정을 볼 수 있다
    try {
      const { data: staffMatches } = await supabaseAdmin
        .from('staff_profiles')
        .select('id, phone')
        .is('user_profile_id', null)
        .eq('name', input.name.trim())
      const match = (staffMatches ?? []).find(s => {
        const staffPhone = normalizePhone(s.phone ?? '')
        // 양쪽에 전화번호가 있으면 일치해야 하고, 동명이인(2건 이상)은 전화번호 일치만 허용
        if (staffPhone && phone) return staffPhone === phone
        return (staffMatches ?? []).length === 1
      })
      if (match) {
        await supabaseAdmin.from('staff_profiles').update({ user_profile_id: userId }).eq('id', match.id)
      }
    } catch { /* 자동 연결 실패는 가입을 막지 않는다 */ }

    after(async () => {
      const { notifyDiscord } = await import('@/lib/discord')
      await notifyDiscord('add', '👤 새 직원 가입', `**${input.name.trim()}** (${input.email.trim()})`)
    })

    return { success: true, data: { userId } }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

export async function setUserRole(userId: string, role: UserAppRole): Promise<ApiResponse> {
  return wrap(async () => {
    await requireAdmin()

    const { data: profile } = await supabaseAdmin.from('user_profiles').select('name').eq('id', userId).maybeSingle()

    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({ worker_role: role })
      .eq('id', userId)
    if (error) throw new Error(error.message)

    // user_metadata를 통째로 덮어쓰면 name 등 기존 값이 사라지므로 현재 값을 먼저 읽어 spread
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { ...authUser?.user?.user_metadata, role } })

    const label = role === 'admin' ? '관리자' : role === 'manager' ? '매니저' : '직원'
    after(async () => {
      const { notifyDiscord } = await import('@/lib/discord')
      await notifyDiscord('edit', `🔐 권한 변경`, `**${profile?.name ?? userId}** → ${label}`)
    })
  })
}

/** user_profiles + auth 계정 삭제 공통 로직 — 실패 시 error.message, 성공 시 삭제된 계정 이름을 반환 */
async function deleteUserAccountById(userId: string, fallbackName: string): Promise<{ error: string } | { name: string }> {
  const { data: profile } = await supabaseAdmin.from('user_profiles').select('name').eq('id', userId).maybeSingle()
  const name = profile?.name ?? fallbackName

  await supabaseAdmin.from('user_profiles').delete().eq('id', userId)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  return { name }
}

export async function deleteMyAccount(): Promise<ApiResponse> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const result = await deleteUserAccountById(user.id, user.email ?? user.id)
    if ('error' in result) return { success: false, error: result.error }

    after(async () => {
      const { notifyDiscord } = await import('@/lib/discord')
      await notifyDiscord('delete', '🚪 직원 탈퇴', `**${result.name}** (${user.email}) 계정이 삭제되었습니다.`)
    })

    return { success: true }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/** 관리자가 다른 직원 계정을 강제 탈퇴시킨다 — staff_profiles 연결은 ON DELETE SET NULL로 자동 해제(HR 기록은 유지) */
export async function adminDeleteUserAccount(userId: string): Promise<ApiResponse> {
  try {
    const admin = await getAuthUser()
    if (!admin || admin.role !== 'admin') return { success: false, error: '권한이 없습니다.' }
    if (admin.id === userId) return { success: false, error: '본인 계정은 여기서 탈퇴할 수 없습니다.' }

    const result = await deleteUserAccountById(userId, userId)
    if ('error' in result) return { success: false, error: result.error }

    return { success: true }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/** 관리자가 직원 비밀번호를 가입 시 초기값(전화번호)으로 되돌린다 — 대시보드 수동 처리 대신 인사/설정 탭에서 처리 */
export async function resetWorkerPassword(userId: string): Promise<ApiResponse<{ name: string }>> {
  return wrap(async () => {
    await requireAdmin()

    const { data: profile } = await supabaseAdmin.from('user_profiles').select('name, phone').eq('id', userId).maybeSingle()
    if (!profile) throw new Error('사용자를 찾을 수 없습니다.')
    if (!profile.phone) throw new Error('전화번호가 등록되어 있지 않아 초기화할 수 없습니다.')

    // 저장된 값이 과거 형식(하이픈 포함)이더라도 초기 비밀번호는 항상 숫자만으로 통일한다
    const phone = normalizePhone(profile.phone)
    if (!isValidKoreanPhone(phone)) throw new Error('전화번호 형식이 올바르지 않아 초기화할 수 없습니다.')
    if (phone !== profile.phone) await supabaseAdmin.from('user_profiles').update({ phone }).eq('id', userId)

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: phone })
    if (error) throw new Error(error.message)

    after(async () => {
      const { notifyDiscord } = await import('@/lib/discord')
      await notifyDiscord('edit', '🔑 비밀번호 초기화', `**${profile.name}** 님의 비밀번호가 초기값(전화번호)으로 재설정되었습니다.`)
    })

    return { name: profile.name }
  })
}

export async function fetchAllUserProfiles(): Promise<ApiResponse<UserProfile[]>> {
  return wrap(async () => {
    await requireAdmin()
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select(USER_PROFILE_COLUMNS)
      .order('name')
    if (error) throw new Error(error.message)
    return (data ?? []) as UserProfile[]
  })
}

/** 관리자가 4대보험 신고 등 목적으로 특정 직원의 주민등록번호 전체를 열람 */
export async function getResidentIdForInsurance(userId: string): Promise<ApiResponse<{ residentId: string }>> {
  try {
    await requireAdmin()

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('name, resident_reg_no_enc')
      .eq('id', userId)
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    if (!data?.resident_reg_no_enc) return { success: false, error: '등록된 주민등록번호가 없습니다.' }

    const residentId = decryptResidentId(data.resident_reg_no_enc)

    return { success: true, data: { residentId } }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/**
 * 인사탭 목록에 곧바로 띄우기 위한 전체 주민등록번호 일괄 복호화 — { userProfileId: 13자리 } 맵.
 * 인사탭은 미들웨어(proxy.ts)와 (admin)/layout.tsx가 이중으로 admin만 통과시키는 경로다.
 */
export async function fetchResidentIdsForHr(): Promise<ApiResponse<Record<string, string>>> {
  try {
    await requireAdmin()

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, resident_reg_no_enc')
      .not('resident_reg_no_enc', 'is', null)
    if (error) return { success: false, error: error.message }

    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      // 키 교체 등으로 한 건이 깨져도 나머지 목록까지 비우지 않는다
      try { map[row.id] = decryptResidentId(row.resident_reg_no_enc!) } catch { /* 해당 건만 미표시 */ }
    }

    return { success: true, data: map }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}

/** 기존 가입자가 /my 페이지에서 본인 주민등록번호를 소급 입력 — 이미 등록된 경우 재입력 불가(관리 화면에서만 정정) */
export async function setMyResidentId(residentIdFront: string, residentIdBack: string): Promise<ApiResponse> {
  try {
    const user = await getAuthUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const front = residentIdFront.trim()
    const back = residentIdBack.trim()
    if (!isValidResidentRegistrationNumber(front, back)) {
      return { success: false, error: '주민등록번호가 올바르지 않습니다.' }
    }

    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('resident_reg_no_enc')
      .eq('id', user.id)
      .maybeSingle()
    if (existing?.resident_reg_no_enc) {
      return { success: false, error: '이미 등록되어 있습니다. 정정이 필요하면 관리자에게 문의해주세요.' }
    }

    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({
        resident_reg_no_enc: encryptResidentId(`${front}${back}`),
        resident_reg_no_masked: maskResidentId(front, back),
      })
      .eq('id', user.id)
    if (error) return { success: false, error: error.message }

    return { success: true }
  } catch (err) {
    if (isNextInternalControlFlowError(err)) throw err
    return { success: false, error: String(err) }
  }
}
