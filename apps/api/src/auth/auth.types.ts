import type { UserRole } from '../users/user.entity'

/** 액세스 토큰에서 복원한 요청 주체. DB 조회 없이 토큰만으로 채운다 */
export interface AuthUser {
  id: string
  email: string
  role: UserRole
}
