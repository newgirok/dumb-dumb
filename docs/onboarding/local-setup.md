# 로컬 환경 세팅

프론트엔드(Next.js)와 API 서버(NestJS), 그리고 자체 PostgreSQL을 로컬에서 함께 띄우는 절차다.

---

## 사전 요구사항

| 도구 | 버전 | 설치 방법 |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| PostgreSQL | 16+ (PostGIS 포함) | https://www.postgresql.org / https://postgis.net |
| psql | PostgreSQL 클라이언트 | PostgreSQL 설치에 포함 |
| Docker Desktop | 최신 (프론트 컨테이너 실행용, 선택) | https://docker.com |
| Git | 최신 | https://git-scm.com |

PostgreSQL에는 다음 확장이 필요하다: **PostGIS**, **pg_cron**, **pgcrypto**, **citext**.

---

## 1. 저장소 클론

```bash
git clone https://github.com/newgirok/open-world-casual-journey.git
cd open-world-casual-journey
```

---

## 2. 의존성 설치

프론트엔드(루트)와 API 서버(`apps/api`)의 의존성을 각각 설치한다.

```bash
# 프론트엔드 (루트)
npm install

# API 서버
cd apps/api
npm install
cd ../..
```

---

## 3. PostgreSQL 준비

### 3-1. 확장 설치

로컬 PostgreSQL에 접속해 필요한 확장을 활성화한다.

```bash
psql -U postgres -d postgres
```

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
```

> `pg_cron`은 `postgresql.conf`의 `shared_preload_libraries`에 `pg_cron`을 추가하고 PostgreSQL을 재시작해야 활성화된다. 매일 15:00 UTC(=00:00 KST) 광고 활성화 스케줄(`activate-ads`)에 사용된다.

### 3-2. 마이그레이션 적용

`supabase/migrations/`의 SQL 파일을 **번호 순서대로** psql로 적용한다(전용 CLI 러너는 없다).

```bash
for f in supabase/migrations/*.sql; do
  psql -U postgres -d postgres -f "$f"
done
```

또는 개별 적용:

```bash
psql -U postgres -d postgres -f supabase/migrations/0001_init.sql
psql -U postgres -d postgres -f supabase/migrations/0002_characters.sql
# ... 0003 ~ 0010 순서대로
```

### 3-3. `app_api` 롤 생성

API 서버는 테이블 소유자가 아닌 전용 롤 **`app_api`**로 접속해야 RLS(행 수준 보안)가 적용된다.

```sql
CREATE ROLE app_api LOGIN;
GRANT CONNECT ON DATABASE postgres TO app_api;
GRANT USAGE ON SCHEMA public TO app_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_api;
```

> RLS 정책과 `users.role` 컬럼 권한(권한 상승 방지)은 마이그레이션 `0007_rls.sql`에서 함께 정의된다.

---

## 4. 환경변수 설정

프론트엔드와 API 서버 각각에 `.env.local`을 만든다.

```bash
# 프론트엔드 (루트)
cp .env.example .env.local

# API 서버
cp apps/api/.env.example apps/api/.env.local
```

`apps/api/.env.local`의 `DATABASE_URL`은 반드시 `app_api` 롤을 사용한다.

```env
DATABASE_URL=postgresql://app_api@localhost:5432/postgres
```

전체 항목 설명은 [환경변수 레퍼런스](./env-vars.md)를 참고하라.

---

## 5. 개발 서버 기동

API 서버와 프론트엔드를 각각 실행한다(터미널 2개).

```bash
# 터미널 1 — API 서버 (NestJS, 9001 포트, watch 모드)
cd apps/api
npm run start:dev
```

```bash
# 터미널 2 — 프론트엔드 (Next.js, 3000 포트, Turbopack)
npm run dev
```

브라우저 → Next.js Route Handler(BFF 프록시) → NestJS API 순으로 호출되며, 월드 실시간 소켓은 브라우저가 `NEXT_PUBLIC_WS_URL`(기본 `http://localhost:9001`)로 직접 접속한다.

---

## 6. 접속 확인

브라우저에서 http://localhost:3000 접속. 루트 진입 시 베이크드 로우폴리 3D 숲 씬이 열리고, 화면 5시에 GIS 미니맵이 함께 뜬다.

첫 번째 페이지 요청 시 Turbopack이 해당 라우트를 컴파일한다(최초 ~5~9초, 이후 캐시됨). API 헬스 체크는 http://localhost:3000/api/health 로 확인할 수 있다.

> 개발 편의를 위해 개발 모드에서는 루트 진입 시 인증 게이팅을 우회해 3D 씬을 바로 연다. 인증 시스템 자체는 유지되며 상용 전 재활성화한다.

---

## Docker로 프론트만 띄우기 (선택)

`docker-compose.yml`에는 프론트엔드(`app` 서비스)만 정의되어 있다. API 서버와 PostgreSQL은 위 절차대로 호스트에서 직접 실행한다.

```bash
# 프론트 컨테이너 기동
docker compose up -d

# 로그 확인
docker compose logs -f

# 종료
docker compose down
```

`WATCHPACK_POLLING=true`가 설정되어 있어 Windows에서도 핫 리로드가 정상 작동한다. 내부적으로 `next dev --turbopack`으로 실행된다.

---

## 관련 문서

- [환경변수 레퍼런스](./env-vars.md)
- [클라우드 인프라 초기 셋업](./infra-setup.md)
- [개발 명령어](./commands.md)
