# ADR 011: Supabase 흔적 정리 — 마이그레이션은 apps/api/migrations로, 안 쓰는 조각은 지운다

**상태:** Accepted

## 결정

백엔드를 자체 호스팅으로 옮긴 뒤([ADR 002](./002-self-hosted-backend.md)) 남아 있던 Supabase 흔적을 정리한다. 모두 지우지는 않고, 지금도 쓰는 것은 이름을 바꿔 옮기고, 아무도 쓰지 않는 Supabase 전용 조각만 지운다.

- **옮긴다**: 마이그레이션 SQL `supabase/migrations/` → `apps/api/migrations/`. 파일 내용은 그대로 둔다.
- **새로 둔다**: `0000_legacy_auth_stub.sql` — `0002`·`0004`가 참조하는 옛 `auth.users`의 빈 스텁. 문서 네 곳에 흩어져 있던 수동 절차를 파일 하나로 옮겼다.
- **지운다**: Edge Function 2개(`livekit-token`·`spatial-query`), Supabase CLI 설정(`config.toml`·`.branches/`·`.gitignore`), 웹 빌드 인자 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`, 루트 `.gitignore`·`tsconfig.json`의 `supabase` 항목, 코드 주석의 옛 이야기.
- **남긴다**: 이미 적용한 마이그레이션(`0006`·`0007`·`0009`) 안의 주석. 그 변경을 왜 했는지 적은 기록이다. DB 안에 있는 `auth` 스키마도 건드리지 않는다.

## 배경

- **Supabase를 쓰는 것처럼 보였다.** 마이그레이션이 `supabase/` 아래에 있었고, Supabase CLI 설정과 웹 빌드 인자가 남아 있었다. 코드와 의존성에서는 Supabase를 쓰지 않는다(`@supabase/*` 패키지 없음).
- **Edge Function은 아무도 부르지 않았다.** `livekit-token`은 API 서버 `POST /voice/token`으로 대체됐다. `spatial-query`가 부르던 DB 함수 `nearby_sponsor_buildings`는 앱에서 부르는 곳이 없고, 호출할 API는 Phase 5에서 API 서버에 만든다.
- **새 DB에 적용하려면 손이 한 번 더 갔다.** `0002`·`0004`가 Supabase Auth의 `auth.users`를 참조해서, 일반 PostgreSQL에서는 스텁을 먼저 손으로 만들어야 했다. 그 절차가 로컬 세팅·명령어·인프라 세팅·배포 런북 문서에 복사돼 있었다.

## 근거

| 관례 | 출처 | 적용 |
|---|---|---|
| 이미 적용한 마이그레이션은 고치거나 지우지 않는다. 고칠 게 있으면 새 마이그레이션을 만든다 | Prisma·Flyway 문서 | `0001`~`0010`은 그대로, 스텁은 새 파일 `0000` |
| 마이그레이션 폴더는 도구·업체 이름이 아니라 하는 일로 부른다 — dbmate 기본 `db/migrations`, node-pg-migrate 기본 `migrations` | dbmate·node-pg-migrate | `migrations/` |
| 파일 이름은 `[버전]_[설명].sql` | dbmate | 지금 이름 그대로 |

- **위치는 API 서버 아래다.** DB를 쓰는 앱은 API 서버 하나다([ADR 008](./008-realtime-server-split.md)). 루트에는 워크스페이스 설정만 두는 표준 모노레포 구성(예정)과도 맞는다.
- **스텁은 두 번 돌려도 된다.** `CREATE … IF NOT EXISTS`라서, 이미 스텁이 있는 DB나 Supabase가 호스팅한 DB에서는 아무 일도 하지 않는다.

## 적용

| 전 | 후 |
|---|---|
| `supabase/migrations/0001`~`0010` | `apps/api/migrations/0001`~`0010` (내용 그대로) |
| 문서마다 적힌 `auth.users` 스텁 SQL | `apps/api/migrations/0000_legacy_auth_stub.sql` |
| `supabase/functions/`·`config.toml`·`.branches/`·`.gitignore` | 지움 (코드는 git 기록에 있다) |
| `Dockerfile`·`docker-compose.yml`의 `NEXT_PUBLIC_SUPABASE_*` | 지움 |
| 코드 주석 "예전엔 Supabase …" | 지움. 이유는 남긴다(섹터 게이트웨이는 "유저마다 직접 쏘면 폭증한다") |

## 주의

- 이미 마이그레이션한 DB에는 새로 적용할 것이 없다. `0000`은 새 DB에서만 필요하다.
- 로컬 `.env.local`에 `NEXT_PUBLIC_SUPABASE_*` 줄이 남아 있으면 지워도 된다. 이제 아무도 읽지 않는다.
- DB에 남은 `auth` 스키마를 지우는 마이그레이션은 만들지 않았다. DB가 Supabase가 호스팅한 Postgres라면 `auth`는 Supabase가 쓰는 스키마라 지우면 안 된다. 자체 호스팅 DB만 쓴다고 확인되면 새 마이그레이션으로 지운다.

## 관련

- [ADR 002: 자체 백엔드 — NestJS + 공유 Postgres](./002-self-hosted-backend.md)
- [ADR 008: 실시간 서버 분리](./008-realtime-server-split.md)
- [ADR 010: 웹 구조와 이름](./010-web-structure-and-naming.md)
- [Prisma — About migration histories](https://www.prisma.io/docs/concepts/components/prisma-migrate/migration-histories)
- [Flyway 마이그레이션 가이드 (DeployHQ)](https://www.deployhq.com/blog/master-your-database-migrations-with-flyway-a-comprehensive-guide-for-all-projects)
- [dbmate](https://github.com/amacneil/dbmate)
- [node-pg-migrate — CLI](https://salsita.github.io/node-pg-migrate/cli)
