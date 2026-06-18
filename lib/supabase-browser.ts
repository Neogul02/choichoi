import { createBrowserClient } from '@supabase/ssr'

// 싱글턴으로 캐싱했다가, 호출 하나가 멈추면(락 경합 등) 같은 인스턴스를 쓰는 모든 후속 호출
// (로그아웃 포함)이 함께 멈추는 문제가 있어 되돌림 — 매 호출마다 새 인스턴스를 생성한다.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
