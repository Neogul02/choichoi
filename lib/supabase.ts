import { createClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './supabase-browser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 이 클라이언트는 realtime 채널 전용(로그인 등 인증 작업은 lib/supabase-browser.ts가 담당).
// 구독은 로그인한 사용자의 JWT로 연다 — postgres_changes는 RLS를 따르므로, 예전처럼 anon으로 구독하려면
// orders 등에 anon 읽기 정책(using true)이 필요했고, 그 정책 때문에 공개된 anon 키만으로 누구나 REST로
// 전체 주문(매출)을 읽을 수 있었다. accessToken 콜백은 연결 시와 heartbeat마다 다시 불려 갱신된 토큰을 따라간다.
// accessToken을 주면 이 클라이언트에는 auth 네임스페이스가 없다(GoTrueClient 중복 경고도 함께 사라진다).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => {
    if (typeof window === 'undefined') return null;
    const { data } = await createSupabaseBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  },
});

export interface OrderItemInput {
  id: number;
  name: string;
  price: number;
  count: number;
}
