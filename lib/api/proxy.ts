import { NextResponse } from 'next/server'
import { API_URL } from './config'

/**
 * 브라우저 → Next 라우트 → NestJS.
 *
 * 브라우저가 API 서버를 직접 부르지 않게 한 겹 둔다. API 주소를 밖으로
 * 내보내지 않아도 되고, CORS 설정도 필요 없다. 액세스 토큰은 메모리에
 * 있으므로 Authorization 헤더를 그대로 흘려보낸다.
 */
export async function proxy(
  request: Request,
  path: string,
  init: { method?: string; body?: string } = {},
) {
  const auth = request.headers.get('authorization')
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body,
    cache: 'no-store',
  })

  const text = await res.text()
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status })
  } catch {
    return NextResponse.json({ message: text || 'API 응답을 읽지 못했습니다.' }, { status: 502 })
  }
}
