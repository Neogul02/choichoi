import { after } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_CODE_COOKIE, claimedRole, isAdminCodePending } from '@/lib/auth-role';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { reportError } from '@/lib/error-report';
import type { ApiResponse } from '@/types/api';

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

// redirect()/notFound()/동적 API 감지(cookies() 등)는 throw로 구현된 Next.js 내부 제어 흐름이다 —
// digest로 식별해 애플리케이션 오류로 오인하지 않고 그대로 다시 던져 Next.js 렌더러가 처리하게 한다.
export function isNextInternalControlFlowError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string') return false;
  return (
    digest === 'DYNAMIC_SERVER_USAGE' ||
    digest.startsWith('NEXT_REDIRECT') ||
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
  );
}

// 인증·권한 실패는 애플리케이션 오류가 아니라 예상된 결과다(로그아웃 상태 접근, 세션 만료 등).
// 이 표식이 붙은 오류는 wrap()이 Discord 알림 없이 그대로 실패 응답으로 변환한다.
export class AuthError extends Error {
  readonly expected = true;
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// instanceof는 같은 모듈이 여러 서버 청크로 중복 번들되면 실패할 수 있어 expected 플래그도 함께 본다
export function isExpectedError(e: unknown): boolean {
  if (e instanceof AuthError) return true;
  return typeof e === 'object' && e !== null && (e as { expected?: unknown }).expected === true;
}

export async function wrap<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    if (isNextInternalControlFlowError(e)) throw e;
    const message = extractErrorMessage(e);
    // 미인증·권한 없음은 정상 동작이므로 오류 알림을 보내지 않는다
    if (isExpectedError(e)) return { success: false, error: message };
    // 어느 액션에서 났는지 스택 상단으로 식별 — 응답 후 전송(after)이라 응답을 막지 않고, 서버리스에서도 완료 보장
    const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(1, 4).join('\n') : null;
    after(() => reportError('서버 액션 실패', message, stack ? [{ name: '위치', value: stack }] : undefined).catch(() => {}));
    return { success: false, error: message };
  }
}

// getClaims()는 비대칭 키(ES256) 프로젝트에서 JWT를 로컬 검증한다
// — getUser()의 매 호출 Auth 서버 왕복을 제거. 세션이 없거나 서명이 유효하지 않으면 null.
// 역할 판정 규칙(app_metadata만, admin은 2차 코드 통과 필요)은 lib/auth-role.ts — proxy.ts와 공유한다.
export async function getAuthUser(): Promise<{
  id: string;
  email: string | null;
  /** 권한 판단용 역할. 2차 코드를 통과하지 않은 admin은 null(일반 user) */
  role: string | null;
  /** 계정에 부여된 역할(2차 코드 반영 전) — 권한 판단에 쓰지 말 것. 로그인 단계의 근무지 판정 등에만 */
  accountRole: string | null;
  /** 이 세션이 admin 계정인데 2차 코드를 아직 통과하지 않았다 — 로그인 화면이 코드를 다시 묻는 데 쓴다 */
  adminCodePending: boolean;
  sessionId: string | null;
  name: string | null;
  user_metadata: Record<string, unknown>;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const adminCodePending = await isAdminCodePending(claims, (await cookies()).get(ADMIN_CODE_COOKIE)?.value);
  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    role: adminCodePending ? null : claimedRole(claims),
    accountRole: claimedRole(claims),
    adminCodePending,
    sessionId: (claims.session_id as string | undefined) ?? null,
    name: (meta.name as string | undefined) ?? null,
    user_metadata: meta,
  };
}

/** 로그인만 요구하는(역할 무관) 액션의 첫 줄에서 호출 — 미인증이면 throw (wrap() 콜백 안에서 쓰면 표준 오류 응답으로 변환됨) */
export async function requireAuth() {
  const user = await getAuthUser();
  if (!user) throw new AuthError('로그인이 필요합니다.');
  return user;
}

/** admin 전용 액션의 첫 줄에서 호출 — 미인증/권한 없음이면 throw (wrap() 콜백 안에서 쓰면 표준 오류 응답으로 변환됨) */
export async function requireAdmin() {
  const user = await getAuthUser();
  if (!user || user.role !== 'admin') throw new AuthError('권한이 없습니다.');
  return user;
}

/** manager 이상(admin·manager) 전용 액션의 첫 줄에서 호출 */
export async function requireManagerOrAdmin() {
  const user = await getAuthUser();
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) throw new AuthError('권한이 없습니다.');
  return user;
}

/**
 * 주방 출근부 키오스크 계정(app_metadata.role = 'kiosk') 또는 admin.
 * 키오스크는 주방 아이패드에 상시 로그인해 두는 계정이라 출근부 액션 외에는 열어주지 않는다 —
 * 다른 액션은 이 함수를 쓰지 말 것.
 */
export async function requireKioskOrAdmin() {
  const user = await getAuthUser();
  if (!user || (user.role !== 'admin' && user.role !== 'kiosk')) throw new AuthError('권한이 없습니다.');
  return user;
}
