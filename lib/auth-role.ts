// 권한 역할 판정 — proxy.ts(화면)와 _base.ts getAuthUser(서버 액션)가 같은 함수를 쓴다.
// 둘이 따로 판정하면 화면은 열리는데 액션은 막히는(또는 반대) 상태가 생긴다.
//
// 1. 역할은 app_metadata.role에서만 읽는다. user_metadata는 본인이 브라우저에서 supabase.auth.updateUser()로
//    마음대로 바꿀 수 있어 거기서 역할을 읽으면 직원 누구나 admin이 된다.
//    app_metadata.role은 DB 트리거가 user_profiles.worker_role과 같은 트랜잭션에서 맞춘다.
// 2. admin은 관리자 2차 코드(ADMIN_LOGIN_CODE)를 이 세션에서 통과해야 admin이다. 예전에는 로그인 화면만
//    코드를 물어서, 비밀번호만 아는 사람도 signInWithPassword가 준 세션 쿠키로 /hr·서버 액션에 바로 들어갈 수 있었다.
//    통과 증명은 httpOnly 쿠키에 담긴 HMAC(코드, 사용자·세션 id) — 코드를 모르면 만들 수 없고,
//    로그아웃하면 세션 id가 바뀌어 무효가 된다. 코드를 바꾸면 모든 관리자가 다시 입력해야 한다.

export const ADMIN_CODE_COOKIE = 'choichoi_admin_code'

type RoleClaims = { sub?: unknown; session_id?: unknown; app_metadata?: unknown }

function adminLoginCode(): string | null {
  return process.env.ADMIN_LOGIN_CODE?.trim() || null
}

// proxy(엣지 호환)와 서버 액션 양쪽에서 돌아야 해서 node:crypto 대신 Web Crypto를 쓴다
async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 코드 통과 시 심을 쿠키 값. 코드 게이트가 꺼져 있거나 세션 id가 없으면 null */
export async function adminCodeProof(userId: string, sessionId: string): Promise<string | null> {
  const code = adminLoginCode()
  if (!code || !sessionId) return null
  return hmacHex(code, `${userId}.${sessionId}`)
}

/** JWT에 실린 역할 원본(2차 코드 반영 전). 문자열이 아니면 null = 일반 user */
export function claimedRole(claims: RoleClaims): string | null {
  const role = (claims.app_metadata as { role?: unknown } | undefined)?.role
  return typeof role === 'string' ? role : null
}

/** admin인데 이 세션에서 2차 코드를 아직 통과하지 않았는가 */
export async function isAdminCodePending(claims: RoleClaims, cookieValue: string | undefined): Promise<boolean> {
  if (claimedRole(claims) !== 'admin' || !adminLoginCode()) return false
  const expected = await adminCodeProof(String(claims.sub ?? ''), String(claims.session_id ?? ''))
  return !expected || !cookieValue || !constantTimeEqual(cookieValue, expected)
}

/** 권한 판단에 쓰는 역할. 코드를 통과하지 않은 admin은 일반 user(null)로 본다 */
export async function effectiveRole(claims: RoleClaims, cookieValue: string | undefined): Promise<string | null> {
  if (await isAdminCodePending(claims, cookieValue)) return null
  return claimedRole(claims)
}
