# ADR 011: DB 마이그레이션 — apps/api/migrations에 두고 번호 순서대로 적용한다

**상태:** Accepted

## 결정

- 마이그레이션 SQL은 DB를 쓰는 유일한 앱인 API 서버 아래 `apps/api/migrations/`에 둔다.
- 파일 이름은 `[번호]_[설명].sql`이고, 관리 롤로 psql을 써서 번호 순서대로(`0000`~`0010`) 적용한다. 전용 러너는 없다.
- 적용한 마이그레이션은 고치거나 지우지 않는다. 고칠 게 있으면 다음 번호로 새 파일을 만든다.
- `0000_auth_users_stub.sql`은 `0002`·`0004`의 외래 키가 가리키는 `auth.users`의 빈 스텁을 만든다. `0006`이 이 참조를 `users`로 옮긴다. 이미 있으면 아무 일도 하지 않으므로, 어떤 PostgreSQL에서도 `0000`부터 순서대로 돈다.

## 근거

| 관례 | 출처 | 적용 |
|---|---|---|
| 적용한 마이그레이션은 고치거나 지우지 않고, 고칠 게 있으면 새 마이그레이션을 만든다 | Prisma·Flyway 문서 | 번호를 이어 새 파일을 만든다 |
| 마이그레이션 폴더는 하는 일로 부른다 — dbmate 기본 `db/migrations`, node-pg-migrate 기본 `migrations` | dbmate·node-pg-migrate | `migrations/` |
| 파일 이름은 `[버전]_[설명].sql` | dbmate | `0001_init.sql` 등 |

- **위치는 API 서버 아래다.** DB를 쓰는 앱은 API 서버 하나고([ADR 008](./008-realtime-server-split.md)), 루트에는 워크스페이스 설정만 두는 표준 모노레포 구성(예정)과도 맞는다.
- **스텁은 두 번 돌려도 된다.** `CREATE … IF NOT EXISTS`라서 이미 스텁이 있는 DB에서는 아무 일도 하지 않는다.

## 적용

- **확장**: PostGIS·pg_cron·pgcrypto·citext가 있어야 한다. pg_cron은 `shared_preload_libraries`에 넣고 재시작해야 켜진다.
- **새 DB**: `for f in apps/api/migrations/*.sql; do psql -v ON_ERROR_STOP=1 "$DATABASE_URL_ADMIN" -f "$f"; done`로 `0000`부터 적용하고, 적용 뒤 `app_api` 롤의 로그인을 켠다([로컬 환경 세팅](../onboarding/local-setup.md) 3-2·3-3).
- **운영 DB**: 아직 적용하지 않은 번호만 순서대로 적용한다([배포 런북](../operations/runbook/deploy.md) 2장).

## 주의

- 마이그레이션은 테이블 소유자 롤(관리 롤)로 적용한다. 애플리케이션 롤 `app_api`는 DDL 권한이 없다.
- 운영 DB에 적용하기 전에 스테이징·로컬 DB에서 같은 순서로 먼저 돌려 본다.

## 관련

- [ADR 002: 자체 백엔드 — NestJS + 공유 Postgres](./002-self-hosted-backend.md)
- [ADR 005: PostGIS + GiST 인덱스](./005-postgis-gist-index.md)
- [ADR 008: 실시간 서버 분리](./008-realtime-server-split.md)
- [데이터 모델](../architecture/data-model.md)
- [Prisma — About migration histories](https://www.prisma.io/docs/concepts/components/prisma-migrate/migration-histories)
- [Flyway 마이그레이션 가이드 (DeployHQ)](https://www.deployhq.com/blog/master-your-database-migrations-with-flyway-a-comprehensive-guide-for-all-projects)
- [dbmate](https://github.com/amacneil/dbmate)
- [node-pg-migrate — CLI](https://salsita.github.io/node-pg-migrate/cli)
