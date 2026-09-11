import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { API_URL, OAUTH_STATE_COOKIE, oauthStateCookieOptions } from '@/lib/api/config'

/** 브라우저를 공급자 동의 화면으로 보낸다 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/auth/oauth/${provider}/callback`

  // CSRF 방어. 콜백에서 쿠키의 값과 대조해 우리가 시작한 흐름인지 확인한다
  const state = randomBytes(16).toString('hex')

  const res = await fetch(
    `${API_URL}/auth/oauth/${provider}/url?redirectUri=${encodeURIComponent(redirectUri)}&state=${state}`,
  )
  if (!res.ok) {
    return NextResponse.redirect(new URL('/login?error=oauth_unavailable', origin))
  }
  const { url } = await res.json()

  const response = NextResponse.redirect(url)
  response.cookies.set(OAUTH_STATE_COOKIE, state, oauthStateCookieOptions)
  return response
}
