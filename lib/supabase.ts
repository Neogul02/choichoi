import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 이 클라이언트는 realtime 채널 전용(로그인 등 인증 작업은 lib/supabase-browser.ts가 담당).
// GoTrueClient는 storageKey 단위로 인스턴스 수를 세므로, persistSession을 꺼도 기본 storageKey
// (sb-{ref}-auth-token)를 그대로 쓰면 supabase-browser.ts의 진짜 인증 클라이언트와 카운트가 겹쳐
// "Multiple GoTrueClient instances" 경고가 뜬다. storageKey를 분리해 경합 자체를 없앤다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-realtime-only-no-auth',
  },
});

export interface OrderItemInput {
  id: number;
  name: string;
  price: number;
  count: number;
}
