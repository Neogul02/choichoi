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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/pos'
    return NextResponse.redirect(url)
  }

  const role = user.user_metadata?.role
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
