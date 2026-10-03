# 개발 명령어

---

## 프론트엔드 (Next.js, 루트)

```bash
# 개발 서버 (핫 리로드, Turbopack, 3000 포트) — 먼저 MapLibre 워커를 public/maplibre에 복사한다(predev)
npm run dev

# 프로덕션 빌드 — 먼저 MapLibre 워커를 public/maplibre에 복사한다(prebuild)
npm run build

# 프로덕션 서버 로컬 실행
npm run start

# TypeScript 타입 체크
npm run type-check

# ESLint 검사 (next lint)
npm run lint
```

저장소에 ESLint 설정 파일이 없어 `npm run lint`는 설정 방식(Strict/Base)을 묻는 대화형 프롬프트를 띄운다. 비대화형 환경(CI 등)의 정적 검사는 `npm run type-check`를 쓴다.

---

## 실시간 서버 (NestJS socket.io, `apps/realtime`)

`apps/realtime` 디렉토리에서 실행한다. 환경변수 없이 기본값(포트 9002, 오리진 `http://localhost:3000`)으로 뜬다.

```bash
# 개발 서버 (watch 모드, 9002 포트)
npm run start:dev

# 서버 실행 (watch 없음)
npm run start

# 빌드
npm run build

# 프로덕션 실행 (dist/apps/realtime/src/main — shared/를 함께 컴파일해 경로가 깊다)
npm run start:prod

# TypeScript 타입 체크
npm run type-check
```

---

## API 서버 (NestJS REST, `apps/api`)

`apps/api` 디렉토리에서 실행한다.

```bash
# 개발 서버 (watch 모드, 9001 포트)
npm run start:dev

# 서버 실행 (watch 없음)
npm run start

# 빌드
npm run build

# 프로덕션 실행 (dist/main)
npm run start:prod

# TypeScript 타입 체크
npm run type-check

# DB 통합 테스트 (Vitest + Testcontainers — Docker가 떠 있어야 한다)
npm test

# 스키마(src/database/schema.ts)를 고친 만큼 다음 번호 마이그레이션 SQL 만들기
npm run db:generate -- --name 설명
# Drizzle이 다루지 않는 함수·트리거·pg_cron·롤·GRANT는 빈 번호 파일을 만들어 직접 쓴다
npm run db:generate -- --custom --name 설명
```

---

## DB 마이그레이션

`apps/api/migrations/`의 SQL을 **번호 순서대로**(`0000`~`0010`) PostgreSQL에 적용한다. 새 마이그레이션은 위 `db:generate`로 만든다([ADR 011](../adr/011-drizzle-orm.md)). 전용 CLI 러너는 없으며 psql로 직접 적용한다(`0000`은 `auth.users` 스텁을 만든다). 적용 뒤 `app_api` 로그인을 켠다([로컬 환경 세팅](./local-setup.md) 3-2·3-3).

```bash
# 전체 순서 적용
for f in apps/api/migrations/*.sql; do
  psql -U postgres -d postgres -f "$f"
done

# 개별 적용
psql -U postgres -d postgres -f apps/api/migrations/0001_init.sql
```

확장(PostGIS / pg_cron / pgcrypto / citext)이 먼저 활성화되어 있어야 한다. 자세한 준비 절차는 [로컬 환경 세팅](./local-setup.md) 참고.

---

## Docker Compose (프론트·실시간 서버)

`docker-compose.yml`에는 서비스가 둘 있다. 프론트엔드 `app`(프로덕션 빌드 — `Dockerfile` builder → runner, standalone `node server.js`, 3000)과 실시간 서버 `realtime`(9002, `apps/realtime/Dockerfile`)이고, `app`을 띄우면 `depends_on`으로 `realtime`도 함께 뜬다. 핫 리로드 개발은 호스트에서 `npm run dev`로 한다. API 서버와 PostgreSQL은 호스트에서 실행한다.

```bash
# 이미지 빌드 + 기동 (app + realtime) — NEXT_PUBLIC_* 빌드 인자를 .env.local에서 채운다
docker compose --env-file .env.local up -d --build

# 로그 실시간 확인
docker compose logs -f

# 종료
docker compose down

# 실시간 서버만 다시 빌드 + 기동
docker compose --env-file .env.local up -d --build realtime

# Docker Desktop 실행 여부 확인
docker info
```

`app`은 `NEXT_PUBLIC_APP_URL`·`NEXT_PUBLIC_WS_URL`을 빌드 시점에 굽는다. 그중 코드가 읽는 값은 `NEXT_PUBLIC_WS_URL`(플레이 씬·내 주변 소켓)이고, `NEXT_PUBLIC_APP_URL`은 코드가 읽지 않는다. `--env-file .env.local` 없이 빌드하면 빈 값으로 구워지고, `NEXT_PUBLIC_WS_URL`만은 비어 있으면 `http://localhost:9002`(실시간 서버)로 굽는다. 코드 변경은 `--build`로 이미지를 다시 만들어야 반영된다(실시간 서버 코드도 같다). `realtime`은 `WEB_ORIGIN`(기본 `http://localhost:3000`)과 `JWT_ACCESS_SECRET`(기본 빈 값 — `/sector` 접속만 거절)을 셸이나 `--env-file`에서 받는다.

---

## 관련 문서

- [로컬 환경 세팅](./local-setup.md)
- [배포 절차](../operations/runbook/deploy.md)
