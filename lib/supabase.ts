import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 이 클라이언트는 realtime 채널 전용(로그인 등 인증 작업은 lib/supabase-browser.ts가 담당) — 그런데도
// createClient 기본값은 GoTrueClient를 켠 채로 만들어져, 같은 브라우저 탭에서 supabase-browser.ts가
// 만드는 진짜 인증 클라이언트와 동일한 storage key(sb-{ref}-auth-token)를 두고 경합해
// "Multiple GoTrueClient instances" 경고가 뜬다. auth를 꺼서 이 인스턴스가 세션에 관여하지 않게 한다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export interface OrderItemInput {
  id: number;
  name: string;
  price: number;
  count: number;
}
