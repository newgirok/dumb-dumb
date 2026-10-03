import { Logger } from '@nestjs/common'
import { Pool } from 'pg'
import { inject } from 'vitest'
import { DatabaseService } from '../src/database/database.service'
import type { AuthUser } from '../src/auth/auth.types'
import type { UsersService } from '../src/users/users.service'

// 서비스가 남기는 경고·오류 로그(중복 승인번호 등)는 테스트가 일부러 만든 것이다
Logger.overrideLogger(false)

/** 테스트 파일마다 DB에 붙는다 — 서비스는 API 롤(app_api)로, 확인·정리는 관리 롤로 */
export function openDb() {
  const pool = new Pool({ connectionString: inject('appUrl'), max: 4 })
  const adminPool = new Pool({ connectionString: inject('adminUrl'), max: 2 })

  /** 관리 롤로 SQL을 실행한다(RLS를 받지 않는다) */
  async function admin<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]> {
    return (await adminPool.query(text, values)).rows as T[]
  }

  return {
    db: new DatabaseService(pool),
    admin,
    /** 테스트마다 빈 테이블과 처음 시리얼(OW-00000001)에서 시작한다 */
    async reset() {
      await admin(
        'TRUNCATE users, orders, characters, user_licenses, user_identities, sponsor_buildings, ad_impressions CASCADE',
      )
      await admin('ALTER SEQUENCE character_serial_seq RESTART WITH 1')
    },
    async close() {
      await Promise.all([pool.end(), adminPool.end()])
    },
  }
}

/** 이메일 가입 유저를 만들어 요청 주체(토큰에서 복원한 값)로 돌려준다 */
export async function signUp(users: UsersService, email: string): Promise<AuthUser> {
  const user = await users.create({ email, passwordHash: 'hash', nickname: email.split('@')[0] })
  return { id: user.id, email: user.email, role: user.role }
}
