import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Pool, type PoolClient } from 'pg'

/** RLS 정책이 읽는 요청 컨텍스트 */
export interface DbContext {
  userId?: string
  role?: 'user' | 'advertiser' | 'admin'
}

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
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end()
  }

  /** 요청 유저 컨텍스트로 트랜잭션을 연다 */
  async withUser<T>(ctx: DbContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', ['app.user_id', ctx.userId ?? ''])
      await client.query('SELECT set_config($1, $2, true)', ['app.user_role', ctx.role ?? 'anon'])
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * RLS를 우회해야 하는 서버 작업용 — 결제 웹훅, 아바타 발급 워커 등.
   * 유저 요청 경로에서는 절대 쓰지 말 것.
   */
  withAdmin<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withUser({ role: 'admin' }, fn)
  }
}
