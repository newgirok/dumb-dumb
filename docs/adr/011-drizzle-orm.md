# ADR 011: API DB 접근 — PostgreSQL을 두고 Drizzle ORM으로 쿼리한다

**상태:** Accepted

## 결정

- API 서버(`apps/api`)는 SQL 문자열을 쓰지 않고 Drizzle ORM 쿼리 빌더로 DB에 접근한다. DB는 PostgreSQL 그대로다.
- 스키마는 `src/database/schema.ts` 하나에 둔다. 마이그레이션 `0000`~`0010`을 적용한 결과와 같고, 제약·인덱스·RLS 정책 이름까지 맞춘다.
- 마이그레이션 SQL은 스키마를 고친 뒤 drizzle-kit으로 만든다. 적용은 지금처럼 psql로 번호 순서대로 한다([ADR 010](./010-db-migrations.md)).
- 연결은 지금 쓰는 `pg` 풀 위에 `drizzle(pool)`을 얹는다. NestJS 연동 패키지는 쓰지 않는다.

## 근거

| 기준 | 확인한 것 | 출처 |
|---|---|---|
| 많이 쓰는 TypeScript ORM | npm 주간 다운로드(2026-09-25~10-01): Drizzle 3,039만, Prisma 2,137만, TypeORM 669만 | npm 다운로드 API |
| NestJS 지원 | 공식 문서가 Drizzle·Prisma·TypeORM을 모두 다룬다 | NestJS 문서 |
| 행 잠금(결제 웹훅 `FOR UPDATE`, 지급 워커 `SKIP LOCKED`) | Drizzle은 `.for('update', { skipLocked: true })`로 쓴다. Prisma는 쿼리 API로 잠그지 못한다(이슈 #30531 미해결) | drizzle-orm 소스, Prisma 이슈 |
| RLS 정책 19개 | Drizzle은 `pgPolicy`로 스키마에 선언하고 drizzle-kit이 SQL을 만든다. Prisma 7·TypeORM은 선언하지 못한다 | Drizzle·Prisma 문서 |
| 조건부 UNIQUE·PostGIS 컬럼 | Drizzle은 `uniqueIndex().where()`와 `geometry()`로 쓴다 | Drizzle 문서 |

- DB를 MongoDB로 바꾸지 않는다. ORM은 DB와 따로 고를 수 있고, 지금 DB는 RLS·행 잠금·조건부 UNIQUE·PostGIS 같은 PostgreSQL 기능에 기대고 있다.
- Prisma 7은 행 잠금 쿼리 2곳과 RLS 정책을 SQL로 남겨야 한다. TypeORM은 쿼리 조건을 문자열로 쓰고 RLS 정책을 선언할 수 없다.

## 적용

- **트랜잭션**: `withUser`·`withAdmin`(`src/database/database.service.ts`)이 Drizzle 트랜잭션(`Tx`)을 연다. `set_config` 두 값을 한 문장으로 넣은 뒤 콜백에 넘긴다.
- **쿼리**: 서비스는 `tx.select()`·`insert()`·`update()`로 쿼리한다. `GREATEST`·`now()`·`nextval` 같은 짧은 식만 `sql` 템플릿으로 쓴다(값은 바인딩된다).
- **UNIQUE 위반**: 23505는 `uniqueViolation(error)`로 가린다. Drizzle은 pg 오류를 `DrizzleQueryError`의 `cause`에 담아 던진다.
- **스키마 변경**:
  1. `schema.ts`를 고친다.
  2. `npm run db:generate -- --name 설명`을 실행한다.
  3. 생성된 `migrations/00NN_설명.sql`을 확인한다.
  4. psql로 적용한다.
- **SQL로 직접 쓰는 변경**: Drizzle이 다루지 않는 함수·트리거·pg_cron·롤·GRANT는 `npm run db:generate -- --custom --name 설명`으로 빈 번호 파일을 만들어 그 안에 쓴다.
- **통합 테스트**: `apps/api/test`(Vitest + Testcontainers)가 실제 PostgreSQL에서 결제 멱등성·`SKIP LOCKED`·RLS 격리를 확인한다([테스트 전략](../testing/strategy.md)).

## 주의

- Drizzle은 1.0 전이다(안정판 0.45, 1.0은 RC). 1.0으로 올리면 관계 쿼리(`db.query`) 문법이 바뀐다. 지금 코드는 관계 쿼리를 쓰지 않는다.
- `drizzle-kit pull`·`push`는 쓰지 않는다.
  - 이 DB에서 pull은 RLS 정책 일부의 USING·WITH CHECK 조건을 빠뜨린다.
  - 복합 인덱스의 연산자 클래스도 뒤바꾸고, `citext`를 읽지 못한다.
  - 기준은 `schema.ts`다. generate는 스키마 파일끼리 비교하므로 이 문제를 받지 않는다.
- drizzle-kit은 PostGIS `geometry`의 SRID를 SQL에 싣지 않는다(`geometry(point)`). 공간 컬럼을 새로 만들면 생성된 SQL에 `geometry(Point,4326)`처럼 SRID를 직접 붙인다.
- `@nestjs/drizzle`은 2026-09-23에 처음 나온 0.0.1이라 쓰지 않는다.

## 관련

- [ADR 002: 자체 백엔드 — NestJS + 공유 Postgres](./002-self-hosted-backend.md)
- [ADR 010: DB 마이그레이션](./010-db-migrations.md)
- [백엔드 개발 컨벤션](../backend/conventions.md)
- [테스트 전략](../testing/strategy.md)
- [Drizzle — RLS](https://orm.drizzle.team/docs/rls)
- [Drizzle Kit — generate](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [NestJS — Drizzle](https://docs.nestjs.com/data/drizzle)
- [Prisma — 행 잠금 이슈 #30531](https://github.com/prisma/orm/issues/30531)
- [npm 다운로드 수 API](https://github.com/npm/registry/blob/main/docs/download-counts.md)
