import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { API_URL, REFRESH_COOKIE, refreshCookieOptions } from '@/lib/api/config'

/** 새로고침 직후 액세스 토큰을 메모리에 다시 채우는 경로 */
export async function POST() {
  const store = await cookies()
  const refreshToken = store.get(REFRESH_COOKIE)?.value
  if (!refreshToken) {
    return NextResponse.json({ message: '세션이 없습니다.' }, { status: 401 })
  }

  const res = await fetch(`${API_URL}/auth/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  const body = await res.json()

  if (!res.ok) {
    // 폐기·만료된 토큰은 쿠키에서 치운다. 안 그러면 미들웨어가 계속
    // 로그인된 것으로 보고 리다이렉트 루프에 빠진다
    const response = NextResponse.json(body, { status: res.status })
    response.cookies.delete(REFRESH_COOKIE)
    return response
  }

  const response = NextResponse.json({ accessToken: body.accessToken })
  response.cookies.set(REFRESH_COOKIE, body.refreshToken, refreshCookieOptions)
  return response
}
