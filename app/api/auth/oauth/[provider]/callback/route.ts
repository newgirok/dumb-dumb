import { NextResponse } from 'next/server'
import {
  API_URL,
  OAUTH_STATE_COOKIE,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from '@/lib/api/config'

/** 공급자가 인가 코드를 붙여 돌려보내는 자리 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  const url = new URL(request.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/login?error=${reason}`, origin))
    response.cookies.delete(OAUTH_STATE_COOKIE)
    return response
  }

  // 사용자가 동의를 거부하면 code 없이 error 만 붙어서 돌아온다
  if (!code) return fail('oauth_cancelled')

  const expected = request.headers
    .get('cookie')
    ?.split('; ')
    .find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`))
    ?.slice(OAUTH_STATE_COOKIE.length + 1)

  if (!state || !expected || state !== expected) return fail('oauth_state')

  const res = await fetch(`${API_URL}/auth/oauth/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirectUri: `${origin}/api/auth/oauth/${provider}/callback`,
    }),
  })
  if (!res.ok) return fail('oauth_failed')

  const body = await res.json()

  // 액세스 토큰은 URL에 실어 보내지 않는다 (브라우저 기록·리퍼러에 남는다).
  // 리프레시 쿠키만 심고, 클라이언트가 refresh()로 액세스 토큰을 받아간다
  const response = NextResponse.redirect(new URL('/dashboard', origin))
  response.cookies.set(REFRESH_COOKIE, body.refreshToken, refreshCookieOptions)
  response.cookies.delete(OAUTH_STATE_COOKIE)
  return response
}
