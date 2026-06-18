import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// 호출마다 새 인스턴스를 만들면 같은 탭에 여러 GoTrueClient가 동시에 존재하게 되어
// 인증 스토리지/락을 두고 충돌할 수 있다 (로그아웃 후 재로그인이 멈추는 증상의 원인 중 하나).
// 싱글턴으로 캐싱해 탭당 인스턴스를 하나만 유지한다.
let client: SupabaseClient | undefined

export function createSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
