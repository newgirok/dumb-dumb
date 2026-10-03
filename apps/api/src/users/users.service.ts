import { ConflictException, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import { authProvider, userIdentities, userLicenses, users } from '../database/schema'
import type { User, UserWithSecret } from './user.entity'

type Provider = (typeof authProvider.enumValues)[number]

/** 밖으로 내보내는 유저 컬럼 — 비밀번호 해시는 빠진다 */
const COLUMNS = {
  id: users.id,
  email: users.email,
  nickname: users.nickname,
  role: users.role,
  tokenVersion: users.tokenVersion,
  createdAt: users.createdAt,
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * 인증 경로 전용 — 아직 로그인하지 않은 요청이라 RLS 컨텍스트가 없다.
   * 비밀번호 해시를 함께 돌려주므로 호출부를 인증 로직으로 제한할 것.
   */
  async findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    return this.db.withAdmin(async (tx) => {
      const [user] = await tx
        .select({ ...COLUMNS, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.email, email))
      return user ?? null
    })
  }

  async findById(id: string): Promise<User | null> {
    return this.db.withAdmin(async (tx) => {
      const [user] = await tx.select(COLUMNS).from(users).where(eq(users.id, id))
      return user ?? null
    })
  }

  /**
   * 가입. 기본 라이선스(반경 25m) 생성까지 한 트랜잭션에서 처리한다.
   */
  async create(input: {
    email: string
    passwordHash: string
    nickname: string
  }): Promise<User> {
    return this.db.withAdmin(async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email))
      if (existing) throw new ConflictException('이미 가입된 이메일입니다.')

      const [user] = await tx.insert(users).values(input).returning(COLUMNS)
      await tx.insert(userLicenses).values({ userId: user.id })
      return user
    })
  }

  /** 연결된 소셜 계정으로 유저를 찾는다 */
  async findBySocial(provider: Provider, providerUserId: string): Promise<User | null> {
    return this.db.withAdmin(async (tx) => {
      const [user] = await tx
        .select(COLUMNS)
        .from(userIdentities)
        .innerJoin(users, eq(users.id, userIdentities.userId))
        .where(and(eq(userIdentities.provider, provider), eq(userIdentities.providerUserId, providerUserId)))
      return user ?? null
    })
  }

  /** 기존 계정에 소셜 로그인 수단을 붙인다 */
  async linkIdentity(input: {
    userId: string
    provider: Provider
    providerUserId: string
    email: string | null
  }): Promise<void> {
    await this.db.withAdmin((tx) =>
      tx
        .insert(userIdentities)
        .values(input)
        .onConflictDoNothing({ target: [userIdentities.provider, userIdentities.providerUserId] }),
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
    provider: Provider
    providerUserId: string
    providerEmail: string | null
  }): Promise<User> {
    return this.db.withAdmin(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash: null, nickname: input.nickname })
        .returning(COLUMNS)
      await tx.insert(userLicenses).values({ userId: user.id })
      await tx.insert(userIdentities).values({
        userId: user.id,
        provider: input.provider,
        providerUserId: input.providerUserId,
        email: input.providerEmail,
      })
      return user
    })
  }

  /** 이메일로 찾는다 (비밀번호 해시 없이) */
  async findByEmail(email: string): Promise<User | null> {
    return this.db.withAdmin(async (tx) => {
      const [user] = await tx.select(COLUMNS).from(users).where(eq(users.email, email))
      return user ?? null
    })
  }

  /** 리프레시 토큰 일괄 폐기 — 로그아웃·비밀번호 변경 시 */
  async bumpTokenVersion(id: string): Promise<void> {
    await this.db.withAdmin((tx) =>
      tx
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: sql`now()` })
        .where(eq(users.id, id)),
    )
  }
}
