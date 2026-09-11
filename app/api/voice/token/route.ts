import { NextResponse } from 'next/server'
import { API_URL } from '@/lib/api/config'

/** LiveKit 토큰 프록시 — 액세스 토큰을 그대로 전달한다 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth) return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 })

  const res = await fetch(`${API_URL}/voice/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(await request.json()),
  })
  return NextResponse.json(await res.json(), { status: res.status })
}
