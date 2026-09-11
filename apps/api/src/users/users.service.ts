import { ConflictException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import type { User, UserWithSecret } from './user.entity'

const COLUMNS = `id, email, nickname, role, token_version, created_at`

function toUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    nickname: row.nickname as string,
    role: row.role as User['role'],
    tokenVersion: row.token_version as number,
    createdAt: row.created_at as Date,
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * 인증 경로 전용 — 아직 로그인하지 않은 요청이라 RLS 컨텍스트가 없다.
   * 비밀번호 해시를 함께 돌려주므로 호출부를 인증 로직으로 제한할 것.
   */
  async findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(
        `SELECT ${COLUMNS}, password_hash FROM users WHERE email = $1`,
        [email],
      )
      if (rows.length === 0) return null
      return { ...toUser(rows[0]), passwordHash: rows[0].password_hash }
    })
  }

  async findById(id: string): Promise<User | null> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id])
      return rows.length ? toUser(rows[0]) : null
    })
  }

  /**
   * 가입. 기본 라이선스(반경 25m) 생성까지 한 트랜잭션에서 처리한다 —
   * 예전에는 Supabase의 on_auth_user_created 트리거가 하던 일이다.
   */
  async create(input: {
    email: string
    passwordHash: string
    nickname: string
  }): Promise<User> {
    return this.db.withAdmin(async (client) => {
      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email])
      if (existing.rowCount) throw new ConflictException('이미 가입된 이메일입니다.')

      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, nickname)
         VALUES ($1, $2, $3)
         RETURNING ${COLUMNS}`,
        [input.email, input.passwordHash, input.nickname],
      )
      const user = toUser(rows[0])
      await client.query('INSERT INTO user_licenses (user_id) VALUES ($1)', [user.id])
      return user
    })
  }

  /** 연결된 소셜 계정으로 유저를 찾는다 */
  async findBySocial(provider: string, providerUserId: string): Promise<User | null> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.nickname, u.role, u.token_version, u.created_at
           FROM user_identities i
           JOIN users u ON u.id = i.user_id
          WHERE i.provider = $1 AND i.provider_user_id = $2`,
        [provider, providerUserId],
      )
      return rows.length ? toUser(rows[0]) : null
    })
  }

  /** 기존 계정에 소셜 로그인 수단을 붙인다 */
  async linkIdentity(input: {
    userId: string
    provider: string
    providerUserId: string
    email: string | null
  }): Promise<void> {
    await this.db.withAdmin((client) =>
      client.query(
        `INSERT INTO user_identities (user_id, provider, provider_user_id, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, provider_user_id) DO NOTHING`,
        [input.userId, input.provider, input.providerUserId, input.email],
      ),
    )
  }

  /**
   * 소셜 전용 신규 가입. 비밀번호가 없으므로 password_hash 는 NULL 이다
   * (0009 마이그레이션에서 NOT NULL 을 풀었다).
   *
   * 기본 라이선스 생성까지 create() 와 같은 트랜잭션 구성을 유지한다.
   */
  async createFromSocial(input: {
    email: string
    nickname: string
    provider: string
    providerUserId: string
    providerEmail: string | null
  }): Promise<User> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, nickname)
         VALUES ($1, NULL, $2)
         RETURNING ${COLUMNS}`,
        [input.email, input.nickname],
      )
      const user = toUser(rows[0])
      await client.query('INSERT INTO user_licenses (user_id) VALUES ($1)', [user.id])
      await client.query(
        `INSERT INTO user_identities (user_id, provider, provider_user_id, email)
         VALUES ($1, $2, $3, $4)`,
        [user.id, input.provider, input.providerUserId, input.providerEmail],
      )
      return user
    })
  }

  /** 이메일로 찾는다 (비밀번호 해시 없이) */
  async findByEmail(email: string): Promise<User | null> {
    return this.db.withAdmin(async (client) => {
      const { rows } = await client.query(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email])
      return rows.length ? toUser(rows[0]) : null
    })
  }

  /** 리프레시 토큰 일괄 폐기 — 로그아웃·비밀번호 변경 시 */
  async bumpTokenVersion(id: string): Promise<void> {
    await this.db.withAdmin((client) =>
      client.query(
        'UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1',
        [id],
      ),
    )
  }
}
