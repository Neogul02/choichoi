'use server'

import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { ApiResponse } from '@/types/api'
import type { Worker } from '@/types/database'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export interface UserProfile {
  id: string
  name: string
  phone: string | null
  bank_name: string | null
  bank_account: string | null
  health_cert_url: string | null
  active_title_key: string | null
  title_color: string | null
  worker_role: string
  total_revenue: number
}

export async function getMyProfile(): Promise<ApiResponse<UserProfile>> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: '프로필 없음' }
    return { success: true, data: data as UserProfile }
  } catch (err) {
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

export async function getMyOrderStats(): Promise<ApiResponse<MyOrderStats>> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle()

    const cashierName = profile?.name ?? user.user_metadata?.name
    if (!cashierName) return { success: false, error: '프로필 없음' }

    // 1000건 제한 우회: 페이지네이션으로 전체 로드
    const PAGE = 1000
    let allOrders: { id: number; total_price: number; payment_method: string | null; created_at: string; popup_id: number | null }[] = []
    let fetchError: string | null = null
    for (let page = 0; ; page++) {
      const { data, error: err } = await supabaseAdmin
        .from('orders')
        .select('id, total_price, payment_method, created_at, popup_id')
        .eq('cashier_name', cashierName)
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: true })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (err) { fetchError = err.message; break }
      if (!data || data.length === 0) break
      allOrders = allOrders.concat(data)
      if (data.length < PAGE) break
    }
    if (fetchError) return { success: false, error: fetchError }

    const { data: popups } = await supabaseAdmin
      .from('popup_events')
      .select('id, name, start_date, end_date')
      .order('start_date', { ascending: true })

    if (allOrders.length === 0) {
      return { success: true, data: { totalOrders: 0, totalRevenue: 0, byPopup: [] } }
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
      const utcMs = Date.parse(o.created_at.includes('+') || o.created_at.endsWith('Z') ? o.created_at : o.created_at + 'Z')
      const kst = new Date(utcMs + 9 * 60 * 60 * 1000)
      const date = kst.toISOString().slice(0, 10)

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
      success: true,
      data: {
        totalOrders: allOrders.length,
        totalRevenue: allOrders.reduce((s, o) => s + o.total_price, 0),
        byPopup,
      },
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export interface RegisterProfileInput {
  userId: string
  name: string
  phone: string
  bankName?: string
  bankAccount?: string
  healthCertUrl?: string
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
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const updates: Record<string, string | null> = {}
    if (input.name !== undefined) updates.name = input.name || null
    if (input.phone !== undefined) updates.phone = input.phone || null
    if (input.bankName !== undefined) updates.bank_name = input.bankName || null
    if (input.bankAccount !== undefined) updates.bank_account = input.bankAccount || null
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
    return { success: false, error: String(err) }
  }
}

export async function registerProfile(input: RegisterProfileInput): Promise<ApiResponse> {
  try {
    const { error } = await supabaseAdmin.from('user_profiles').insert([{
      id: input.userId,
      name: input.name,
      phone: input.phone || null,
      bank_name: input.bankName || null,
      bank_account: input.bankAccount || null,
      health_cert_url: input.healthCertUrl || null,
      worker_role: 'worker',
    }])
    if (error) return { success: false, error: error.message }

    // user_metadata.role 동기화
    await supabaseAdmin.auth.admin.updateUserById(input.userId, {
      user_metadata: { role: 'worker', name: input.name },
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
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
    return { success: false, error: String(err) }
  }
}

export async function checkSignupCode(code: string): Promise<ApiResponse> {
  const expected = process.env.SIGNUP_CODE
  if (!expected) return { success: false, error: '초대 코드가 설정되지 않았습니다.' }
  if (code.trim() !== expected.trim()) return { success: false, error: '초대 코드가 올바르지 않습니다.' }
  return { success: true }
}

export interface CreateWorkerAccountInput {
  inviteCode: string
  email: string
  password: string
  name: string
  phone: string
  bankName?: string
  bankAccount?: string
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

    // 2. admin API로 유저 생성 (이메일 인증 메일 없음, rate limit 없음)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email.trim(),
      password: input.password.trim(),
      email_confirm: true,
      user_metadata: { role: 'worker', name: input.name.trim() },
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
      phone: input.phone.trim() || null,
      bank_name: input.bankName?.trim() || null,
      bank_account: input.bankAccount?.trim() || null,
      worker_role: 'worker',
    }])

    if (profileError) {
      // 프로필 실패 시 생성된 auth 유저도 정리
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { success: false, error: `프로필 저장 실패: ${profileError.message}` }
    }

    const { notifyDiscord } = await import('@/lib/discord')
    await notifyDiscord('add', '👤 새 직원 가입', `**${input.name.trim()}** (${input.email.trim()})`)

    return { success: true, data: { userId } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function setUserRole(userId: string, role: 'admin' | 'worker'): Promise<ApiResponse> {
  try {
    const { data: profile } = await supabaseAdmin.from('user_profiles').select('name').eq('id', userId).maybeSingle()

    const { error } = await supabaseAdmin
      .from('user_profiles')
      .update({ worker_role: role })
      .eq('id', userId)
    if (error) return { success: false, error: error.message }

    await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: { role } })

    const label = role === 'admin' ? '관리자' : '직원'
    const { notifyDiscord } = await import('@/lib/discord')
    await notifyDiscord('edit', `🔐 권한 변경`, `**${profile?.name ?? userId}** → ${label}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function deleteMyAccount(): Promise<ApiResponse> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: '로그인이 필요합니다.' }

    const { data: profile } = await supabaseAdmin.from('user_profiles').select('name').eq('id', user.id).maybeSingle()
    const name = profile?.name ?? user.email ?? user.id

    await supabaseAdmin.from('user_profiles').delete().eq('id', user.id)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (error) return { success: false, error: error.message }

    const { notifyDiscord } = await import('@/lib/discord')
    await notifyDiscord('delete', '🚪 직원 탈퇴', `**${name}** (${user.email}) 계정이 삭제되었습니다.`)

    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

const WORKER_COLORS = ['#22c55e', '#6366f1', '#ef4444', '#f97316', '#64748b']

export async function fetchAllUserProfiles(): Promise<ApiResponse<UserProfile[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('name')
    if (error) return { success: false, error: error.message }
    return { success: true, data: (data ?? []) as UserProfile[] }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function findOrCreateWorkerFromProfile(
  eventId: number,
  profileId: string,
): Promise<ApiResponse<Worker>> {
  try {
    // 이미 이 이벤트에 해당 user_profile_id로 등록된 worker 있으면 반환
    const { data: existing } = await supabaseAdmin
      .from('workers')
      .select('*')
      .eq('event_id', eventId)
      .eq('user_profile_id', profileId)
      .maybeSingle()
    if (existing) return { success: true, data: existing as Worker }

    // user_profiles에서 정보 가져오기
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', profileId)
      .single()
    if (profileError || !profile) return { success: false, error: '프로필을 찾을 수 없습니다.' }

    // 이 이벤트의 기존 worker 수로 색상 순환
    const { count } = await supabaseAdmin
      .from('workers')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
    const color = WORKER_COLORS[(count ?? 0) % WORKER_COLORS.length]

    const { data: newWorker, error: createError } = await supabaseAdmin
      .from('workers')
      .insert([{
        event_id: eventId,
        name: profile.name,
        color,
        phone: profile.phone ?? null,
        bank_name: profile.bank_name ?? null,
        bank_account: profile.bank_account ?? null,
        hourly_rate: 0,
        worker_role: profile.worker_role ?? '프론트',
        user_profile_id: profileId,
      }])
      .select()
      .single()
    if (createError || !newWorker) return { success: false, error: createError?.message ?? '생성 실패' }
    return { success: true, data: newWorker as Worker }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
