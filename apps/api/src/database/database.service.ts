import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DrizzleQueryError, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

/** RLS 정책이 읽는 요청 컨텍스트 */
export interface DbContext {
  userId?: string
  role?: 'user' | 'advertiser' | 'admin'
}

/** withUser·withAdmin이 넘겨주는 트랜잭션 — 쿼리는 모두 여기에 한다 */
export type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0]

export const PG_POOL = Symbol('PG_POOL')

export const pgPoolProvider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: Number(config.get('DB_POOL_MAX') ?? 10),
    }),
}

/**
 * 쿼리가 UNIQUE 제약(23505)에 걸렸으면 걸린 제약 이름을, 아니면 null을 돌려준다.
 * Drizzle은 드라이버(pg) 오류를 DrizzleQueryError의 cause에 담아 던진다
 */
export function uniqueViolation(error: unknown): { constraint?: string } | null {
  const cause = (error instanceof DrizzleQueryError ? error.cause : error) as { code?: string; constraint?: string }
  return cause?.code === '23505' ? { constraint: cause.constraint } : null
}

/**
 * RLS 컨텍스트를 붙여 쿼리를 실행한다.
 *
 * 정책은 current_setting('app.user_id') 를 읽는데, 이 값은 반드시 트랜잭션
 * 범위(SET LOCAL)여야 한다. 전역으로 걸면 풀에 반납된 커넥션에 값이 남아
 * 다음 요청이 남의 컨텍스트를 물려받는다 — 그대로 데이터 유출이다.
 *
 * SET 구문은 파라미터 바인딩을 못 받으므로 set_config(키, 값, is_local=true)
 * 를 쓴다. 문자열을 직접 이어붙이면 인젝션 경로가 된다.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: NodePgDatabase

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {
    this.db = drizzle(pool)
  }

  async onModuleDestroy() {
    await this.pool.end()
  }

  /** 요청 유저 컨텍스트로 트랜잭션을 연다 — 콜백이 던지면 되돌린다 */
  withUser<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // 두 값을 한 문장으로 넣어 요청마다 DB 왕복을 하나 줄인다
      await tx.execute(
        sql`SELECT set_config('app.user_id', ${ctx.userId ?? ''}, true), set_config('app.user_role', ${ctx.role ?? 'anon'}, true)`,
      )
      return fn(tx)
    })
  }

  /**
   * RLS를 우회해야 하는 서버 작업용 — 결제 웹훅, 아바타 발급 워커 등.
   * 유저 요청 경로에서는 절대 쓰지 말 것.
   */
  withAdmin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.withUser({ role: 'admin' }, fn)
  }
}
