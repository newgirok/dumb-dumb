'use client'

import { getAccessToken, refresh } from '@/lib/auth/session'

/**
 * 액세스 토큰을 붙여 Next 라우트를 호출한다.
 *
 * 액세스 토큰은 15분짜리라 게임을 하다 보면 반드시 만료된다. 401이 오면
 * 리프레시로 한 번 갱신해 재시도하고, 그래도 안 되면 호출부에 넘긴다.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const call = (token: string | null) =>
    fetch(path, {
      ...init,
      headers: {
        ...init.headers,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  let res = await call(getAccessToken())
  if (res.status === 401) {
    const token = await refresh()
    if (token) res = await call(token)
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      Array.isArray(body.message) ? body.message[0] : (body.message ?? '요청에 실패했습니다.'),
    )
  }
  return body as T
}
