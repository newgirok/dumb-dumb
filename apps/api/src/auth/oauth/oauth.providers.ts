/**
 * 소셜 로그인 공급자 정의.
 *
 * 인가 코드 흐름(Authorization Code)만 쓴다. 암시적 흐름은 액세스 토큰이
 * 브라우저 주소창에 노출되고, 클라이언트 시크릿을 브라우저에 둘 수도 없다.
 * 코드 교환은 전부 이 서버에서 한다.
 */

export type Provider = 'kakao' | 'google'

export interface SocialProfile {
  /** 공급자가 발급한 고유 ID. 신원의 기준 */
  providerUserId: string
  email: string | null
  /** 공급자가 이메일 소유를 확인해 준 경우에만 true */
  emailVerified: boolean
  nickname: string | null
}

export interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  profileUrl: string
  scope: string
  /** 공급자별 응답 모양이 제각각이라 여기서 한 형태로 맞춘다 */
  parseProfile(raw: Record<string, any>): SocialProfile
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    // 이메일은 선택 동의 항목이라 사용자가 거부할 수 있다
    scope: 'profile_nickname account_email',
    parseProfile(raw) {
      const account = raw.kakao_account ?? {}
      return {
        providerUserId: String(raw.id),
        email: account.email ?? null,
        // is_email_valid 는 형식, is_email_verified 는 소유 확인이다. 둘 다 필요
        emailVerified: account.is_email_valid === true && account.is_email_verified === true,
        nickname: account.profile?.nickname ?? null,
      }
    },
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    parseProfile(raw) {
      return {
        providerUserId: String(raw.sub),
        email: raw.email ?? null,
        emailVerified: raw.email_verified === true,
        nickname: raw.name ?? null,
      }
    },
  },
}

export function isProvider(value: string): value is Provider {
  return value === 'kakao' || value === 'google'
}
