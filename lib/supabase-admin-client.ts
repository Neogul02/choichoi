import { createClient } from '@supabase/supabase-js'

// 서버 전용 service-role 클라이언트 — 모든 서버 액션·어드민 헬퍼가 공유한다 (RLS 우회).
// 클라이언트 번들에 포함되면 안 되므로 서버 코드에서만 import할 것.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('[Supabase Admin] Missing NEXT_PUBLIC_SUPABASE_URL')
}
if (!serviceKey && process.env.NODE_ENV === 'production') {
  console.warn(
    '[Supabase Admin] Missing SUPABASE_SERVICE_ROLE_KEY in production! Falling back to ANON_KEY. RLS might block operations.',
  )
}

export const supabaseAdmin = createClient(
  supabaseUrl || '',
  serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
)
