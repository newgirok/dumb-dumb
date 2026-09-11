export type UserRole = 'user' | 'advertiser' | 'admin'

export interface User {
  id: string
  email: string
  nickname: string
  role: UserRole
  tokenVersion: number
  createdAt: Date
}

/**
 * 비밀번호 해시는 인증 경로에서만 쓰고 밖으로 새 나가면 안 된다.
 * 소셜로만 가입한 계정은 비밀번호가 없어서 null 이다.
 */
export interface UserWithSecret extends User {
  passwordHash: string | null
}
