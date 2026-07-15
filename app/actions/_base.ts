import { createSupabaseServerClient } from '@/lib/supabase-server';
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
    return { success: false, error: extractErrorMessage(e) };
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
