import { NextResponse } from 'next/server'
import { API_URL, REFRESH_COOKIE } from '@/lib/api/config'

export async function POST(request: Request) {
  const accessToken = request.headers.get('authorization')
  if (accessToken) {
    // 실패해도 쿠키는 지운다 — 클라이언트는 어차피 로그아웃되어야 한다
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: accessToken },
    }).catch(() => undefined)
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(REFRESH_COOKIE)
  return response
}
