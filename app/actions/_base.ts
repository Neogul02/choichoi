import { after } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { reportError } from '@/lib/error-report';
import type { ApiResponse } from '@/types/api';

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

export async function wrap<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    const message = extractErrorMessage(e);
    // 어느 액션에서 났는지 스택 상단으로 식별 — 응답 후 전송(after)이라 응답을 막지 않고, 서버리스에서도 완료 보장
    const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(1, 4).join('\n') : null;
    after(() => reportError('서버 액션 실패', message, stack ? [{ name: '위치', value: stack }] : undefined).catch(() => {}));
    return { success: false, error: message };
  }
}

// getClaims()는 비대칭 키(ES256) 프로젝트에서 JWT를 로컬 검증한다
// — getUser()의 매 호출 Auth 서버 왕복을 제거. 세션이 없거나 서명이 유효하지 않으면 null.
export async function getAuthUser(): Promise<{
  id: string;
  email: string | null;
  role: string | null;
  name: string | null;
  user_metadata: Record<string, unknown>;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? null,
    role: (meta.role as string | undefined) ?? null,
    name: (meta.name as string | undefined) ?? null,
    user_metadata: meta,
  };
}
