import { NextResponse, type NextRequest } from 'next/server'
import { REFRESH_COOKIE } from '@/lib/api/config'

const PROTECTED = ['/dashboard', '/store', '/admin']

/**
 * 라우팅 UX용 최소 검사.
 *
 * 미들웨어는 Edge 런타임이라 DB를 못 보고, 여기서 토큰을 검증해봐야
 * 실제 권한은 API가 다시 확인한다. 그래서 "세션 쿠키가 있는가"만 보고
 * 리다이렉트를 정한다. 진짜 인가는 NestJS 가드와 RLS가 담당한다.
 */
export function applyAuthMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get(REFRESH_COOKIE)?.value)

  if (!hasSession && PROTECTED.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (hasSession && (pathname === '/login' || pathname === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}
