'use client'

/**
 * 액세스 토큰은 메모리에만 둔다.
 *
 * localStorage에 넣으면 XSS 한 방에 털리고, httpOnly 쿠키에 넣으면 JS가
 * 못 읽어서 WebSocket 접속에 못 쓴다. 그래서 리프레시 토큰만 httpOnly
 * 쿠키에 두고(서버 라우트가 관리), 액세스 토큰은 여기 변수에 들고 있다가
 * 새로고침하면 refresh()로 다시 채운다.
 */

let accessToken: string | null = null
let refreshing: Promise<string | null> | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** 액세스 토큰을 새로 받는다. 동시 호출은 하나로 합친다 */
export function refresh(): Promise<string | null> {
  if (refreshing) return refreshing

  refreshing = fetch('/api/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) {
        accessToken = null
        return null
      }
      const { accessToken: token } = await res.json()
      accessToken = token
      return token as string
    })
    .catch(() => {
      accessToken = null
      return null
    })
    .finally(() => {
      refreshing = null
    })

  return refreshing
}

/** 앱 시작 시 한 번 — 이미 로그인돼 있으면 토큰을 복구한다 */
export async function ensureSession(): Promise<string | null> {
  return accessToken ?? refresh()
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.message ?? '로그인에 실패했습니다.')
  accessToken = body.accessToken
}

export async function register(input: {
  email: string
  password: string
  nickname: string
}): Promise<void> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(Array.isArray(body.message) ? body.message[0] : body.message)
  }
  accessToken = body.accessToken
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  }).catch(() => undefined)
  accessToken = null
}

/** 토큰 페이로드에서 유저 정보를 꺼낸다 (검증은 서버가 한다) */
export function currentUser(): { id: string; email: string; role: string } | null {
  if (!accessToken) return null
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    return { id: payload.sub, email: payload.email, role: payload.role }
  } catch {
    return null
  }
}
