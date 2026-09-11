/** NestJS API 주소. 서버 라우트에서만 쓴다 (브라우저는 Next 라우트를 경유) */
export const API_URL = process.env.API_URL ?? 'http://localhost:9001'

export const REFRESH_COOKIE = 'refresh_token'

/**
 * 리프레시 토큰만 httpOnly 쿠키에 둔다.
 * 액세스 토큰은 WebSocket 접속에 필요해서 JS가 읽어야 하므로 쿠키에 굽지
 * 않고 메모리에만 들고 있는다. 새로고침하면 리프레시로 다시 받는다.
 */
export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
}

export const OAUTH_STATE_COOKIE = 'oauth_state'

/** CSRF state 는 인가 왕복 동안만 살아 있으면 된다 */
export const oauthStateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 10,
}
