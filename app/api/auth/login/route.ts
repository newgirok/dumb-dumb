import { NextResponse } from 'next/server'
import { API_URL, REFRESH_COOKIE, refreshCookieOptions } from '@/lib/api/config'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  const basic = Buffer.from(`${email}:${password}`).toString('base64')

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  })
  const body = await res.json()
  if (!res.ok) return NextResponse.json(body, { status: res.status })

  const response = NextResponse.json({ accessToken: body.accessToken })
  response.cookies.set(REFRESH_COOKIE, body.refreshToken, refreshCookieOptions)
  return response
}
