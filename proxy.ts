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

  if (!claims) {
    const url = request.nextUrl.clone()
    url.pathname = '/pos'
    return NextResponse.redirect(url)
  }

  const role = (claims.user_metadata as { role?: string } | undefined)?.role
  const adminOnlyPrefixes = ['/settings', '/devtools', '/hr', '/stats']
  const managerPrefixes = ['/inventory', '/roster']
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
    '/devtools/:path*',
    '/hr/:path*',
  ],
}
