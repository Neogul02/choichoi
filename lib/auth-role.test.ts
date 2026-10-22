import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { adminCodeProof, effectiveRole, isAdminCodePending } from './auth-role'

// getAuthUser가 실제로 읽는 클레임을 위조해 넣는다 — 정적 검색은 변수를 거친 읽기(meta.role)를 놓친다
let claims: Record<string, unknown> | null = null
let cookieValue: string | undefined
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null }) } }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieValue === undefined ? undefined : { value: cookieValue }) }),
}))
vi.mock('next/server', () => ({ after: () => {} }))
vi.mock('@/lib/error-report', () => ({ reportError: async () => {} }))

const CODE = 'test-admin-code'
const base = { sub: 'u1', session_id: 's1', email: 'a@b.c' }

beforeEach(() => { vi.stubEnv('ADMIN_LOGIN_CODE', CODE); claims = null; cookieValue = undefined })
afterEach(() => { vi.unstubAllEnvs() })

describe('권한 역할 판정 (lib/auth-role)', () => {
  it('user_metadata.role은 무시한다 — 본인이 updateUser로 쓸 수 있는 값', async () => {
    expect(await effectiveRole({ ...base, user_metadata: { role: 'admin' }, app_metadata: {} } as never, undefined)).toBeNull()
  })

  it('app_metadata.role이 없거나 문자열이 아니면 일반 user(null)', async () => {
    expect(await effectiveRole({ ...base }, undefined)).toBeNull()
    expect(await effectiveRole({ ...base, app_metadata: { role: ['admin'] } }, undefined)).toBeNull()
  })

  it('admin은 이 세션의 코드 통과 쿠키가 있어야 admin', async () => {
    const c = { ...base, app_metadata: { role: 'admin' } }
    expect(await effectiveRole(c, undefined)).toBeNull()
    expect(await effectiveRole(c, 'forged')).toBeNull()
    const proof = await adminCodeProof('u1', 's1')
    expect(await effectiveRole(c, proof!)).toBe('admin')
    // 다른 세션(재로그인)이나 다른 사용자에게 쓰던 쿠키는 통하지 않는다
    expect(await effectiveRole({ ...c, session_id: 's2' }, proof!)).toBeNull()
    expect(await effectiveRole({ ...c, sub: 'u2' }, proof!)).toBeNull()
  })

  it('코드를 바꾸면 이전 쿠키는 무효', async () => {
    const proof = await adminCodeProof('u1', 's1')
    vi.stubEnv('ADMIN_LOGIN_CODE', 'new-code')
    expect(await isAdminCodePending({ ...base, app_metadata: { role: 'admin' } }, proof!)).toBe(true)
  })

  it('코드 게이트가 꺼져 있으면(ADMIN_LOGIN_CODE 미설정) admin 그대로', async () => {
    vi.stubEnv('ADMIN_LOGIN_CODE', '')
    expect(await effectiveRole({ ...base, app_metadata: { role: 'admin' } }, undefined)).toBe('admin')
  })

  it('admin이 아닌 역할은 코드와 무관', async () => {
    for (const role of ['manager', 'kiosk', 'user']) {
      expect(await effectiveRole({ ...base, app_metadata: { role } }, undefined)).toBe(role)
    }
  })
})

describe('getAuthUser (서버 액션 권한의 입구)', () => {
  it('user_metadata로 admin을 위조해도 role은 null', async () => {
    const { getAuthUser } = await import('@/app/actions/_base')
    claims = { ...base, user_metadata: { role: 'admin', name: '직원' }, app_metadata: {} }
    const u = await getAuthUser()
    expect(u?.role).toBeNull()
    expect(u?.accountRole).toBeNull()
    expect(u?.name).toBe('직원')
  })

  it('코드를 통과하지 않은 admin은 role null + adminCodePending, 통과하면 admin', async () => {
    const { getAuthUser, requireAdmin } = await import('@/app/actions/_base')
    claims = { ...base, app_metadata: { role: 'admin' } }
    const pending = await getAuthUser()
    expect(pending).toMatchObject({ role: null, accountRole: 'admin', adminCodePending: true })
    await expect(requireAdmin()).rejects.toThrow('권한이 없습니다.')

    cookieValue = (await adminCodeProof('u1', 's1'))!
    expect(await getAuthUser()).toMatchObject({ role: 'admin', adminCodePending: false })
    await expect(requireAdmin()).resolves.toMatchObject({ id: 'u1' })
  })

  it('세션이 없으면 null', async () => {
    const { getAuthUser } = await import('@/app/actions/_base')
    expect(await getAuthUser()).toBeNull()
  })
})
