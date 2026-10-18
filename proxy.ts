import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims()는 비대칭 키(ES256) 프로젝트에서 JWT를 로컬 검증한다 (JWKS는 인스턴스 내 캐시)
  // — getUser()의 매 요청 Auth 서버 왕복을 제거. 페이지 이동·서버 액션 POST 전부에 붙던 비용이었다.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const pathname = request.nextUrl.pathname

  if (!claims) {
    // /pos가 로그인 화면(PasswordGate)이다 — 여기서 되돌리면 무한 리다이렉트
    if (pathname.startsWith('/pos')) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/pos'
    return NextResponse.redirect(url)
  }

  // 역할은 app_metadata에서만 — user_metadata는 본인이 updateUser()로 바꿀 수 있어 권한 판단에 쓰면 누구나 admin이 된다.
  // 역할이 없는 토큰(백필 전에 발급된 것 등)은 일반 user로 취급한다.
  const role = (claims.app_metadata as { role?: string } | undefined)?.role

  // 주방 아이패드에 상시 로그인해 두는 출근부 계정 — 출근부 밖의 화면은 열어주지 않는다
  if (role === 'kiosk') {
    if (pathname.startsWith('/attendance')) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/attendance'
    return NextResponse.redirect(url)
  }
  if (pathname.startsWith('/attendance') && role !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/pos'
    return NextResponse.redirect(url)
  }
  const adminOnlyPrefixes = ['/settings', '/hr', '/stats']
  // 재고탭은 로그인한 모든 직원(user 포함)이 조회 가능 — 편집은 서버 액션 내 requireManagerOrAdmin()이 담당
  const managerPrefixes = ['/roster']
  const isAdminOnlyPath = adminOnlyPrefixes.some(p => request.nextUrl.pathname.startsWith(p))
  const isManagerPath = managerPrefixes.some(p => request.nextUrl.pathname.startsWith(p))

  if (isAdminOnlyPath && role !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/pos'
    return NextResponse.redirect(url)
  }

  if (isManagerPath && role !== 'admin' && role !== 'manager') {
    const url = request.nextUrl.clone()
    url.pathname = '/pos'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/stats/:path*',
    '/schedule/:path*',
    '/settings/:path*',
    '/inventory/:path*',
    '/roster/:path*',
    '/hr/:path*',
    // 로그인만 필요한 개인 페이지 — 미인증 요청을 SSR 전에 걸러 서버 액션이 인증 오류로 실패하지 않게 한다
    '/my/:path*',
    '/attendance/:path*',
    // 홈 화면 앱(manifest start_url)이 /pos로 열린다 — 여기를 안 거치면 로그인해 둔 kiosk 아이패드가 POS를 띄운다
    '/pos/:path*',
    '/orders/:path*',
  ],
}
