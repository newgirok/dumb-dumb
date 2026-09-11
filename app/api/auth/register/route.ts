import { NextResponse } from 'next/server'
import { API_URL, REFRESH_COOKIE, refreshCookieOptions } from '@/lib/api/config'

export async function POST(request: Request) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(await request.json()),
  })
  const body = await res.json()
  if (!res.ok) return NextResponse.json(body, { status: res.status })

  const response = NextResponse.json({ accessToken: body.accessToken })
  response.cookies.set(REFRESH_COOKIE, body.refreshToken, refreshCookieOptions)
  return response
}
