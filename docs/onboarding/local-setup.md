# 로컬 환경 세팅

프론트엔드(Next.js)와 API 서버(NestJS), 그리고 자체 PostgreSQL을 로컬에서 함께 띄우는 절차다.

루트 3D 씬(`/`)만 볼 때는 서버가 필요 없다. 의존성 설치 후 프론트엔드만 띄우면 되고, 5시 미니맵을 보려면 `.env.local`에 `NEXT_PUBLIC_MAPBOX_TOKEN`만 넣으면 된다. API 서버와 PostgreSQL은 로그인·상점·대시보드 월드(위치 동기화·음성)에 필요하다.

---

## 사전 요구사항

| 도구 | 버전 | 설치 방법 |
|---|---|---|
| Node.js | 20 이상 (Docker 이미지는 22) | https://nodejs.org |
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

`supabase/migrations/`의 SQL 파일을 **번호 순서대로** psql로 적용한다(전용 CLI 러너는 없다). `0002`·`0004`는 Supabase의 `auth.users`를 참조하고, `0006`이 그 참조를 자체 `users` 테이블로 옮긴다. 일반 PostgreSQL에는 `auth.users`가 없으므로 먼저 스텁을 만든다.

```sql
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
```

```bash
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$f"
done
```

또는 개별 적용:

```bash
psql -U postgres -d postgres -f supabase/migrations/0001_init.sql
psql -U postgres -d postgres -f supabase/migrations/0002_characters.sql
# ... 0003 ~ 0010 순서대로
```

### 3-3. `app_api` 롤 로그인 활성화

API 서버는 테이블 소유자가 아닌 전용 롤 **`app_api`**로 접속해야 RLS(행 수준 보안)가 적용된다. 롤과 테이블·시퀀스 권한은 `0007_rls.sql`이 `NOLOGIN`으로 만들어 두므로, 마이그레이션 뒤 로그인만 켠다.

```sql
ALTER ROLE app_api WITH LOGIN PASSWORD '<비밀번호>';
GRANT CONNECT ON DATABASE postgres TO app_api;
```

> RLS 정책과 `users.role` 컬럼 권한(권한 상승 방지)은 `0007_rls.sql`, `user_identities` 정책·권한은 `0009_social_login.sql`에 정의된다.

---

## 4. 환경변수 설정

프론트엔드와 API 서버 각각에 `.env.local`을 만든다.

```bash
# 프론트엔드 (루트)
cp .env.example .env.local

# API 서버
cp apps/api/.env.example apps/api/.env.local
```

`apps/api/.env.local`의 `DATABASE_URL`은 반드시 `app_api` 롤을 사용한다. 대시보드 월드의 음성 룸 접속을 쓰려면 `apps/api/.env.example`에 없는 `LIVEKIT_API_KEY`·`LIVEKIT_API_SECRET`을 `apps/api/.env.local`에 직접 추가한다(음성 토큰은 API 서버가 발급한다. 마이크 송출 UI는 아직 없어 룸 접속·구독까지만 동작한다).

```env
DATABASE_URL=postgresql://app_api:<비밀번호>@localhost:5432/postgres
LIVEKIT_API_KEY=APIxxxx
LIVEKIT_API_SECRET=xxxx
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

브라우저 → Next.js Route Handler(BFF 프록시) → NestJS API 순으로 호출되며, 대시보드 월드의 실시간 소켓은 브라우저가 `NEXT_PUBLIC_WS_URL`(기본 `http://localhost:9001`)의 `/world` 네임스페이스로 직접 접속한다.

---

## 6. 접속 확인

| 주소 | 확인 내용 |
|---|---|
| http://localhost:3000 | 루트 3D 씬. 로딩 화면(타이틀 + 스피너) → 인트로 전환 → 3인칭 조작. 인트로가 끝나면 화면 5시에 GIS 미니맵이 뜬다(Mapbox 토큰이 없으면 지도 없이 테두리만 남는다) |
| http://localhost:3000/dashboard | 대시보드 월드. Mapbox 실지형 지도 위에 캐릭터가 뜨고 PC는 WASD·방향키로 움직인다. 위치 동기화·음성은 로그인 세션이 있어야 접속된다 |
| http://localhost:9001/health | API 서버 헬스 → `{ "status": "ok" }` |

`middleware.ts`의 `matcher`가 비어 있어 모든 페이지 라우트는 로그인 없이 열린다. http://localhost:3000/api/health 는 Next 서버 자체의 응답이라 API 서버 상태를 반영하지 않는다.

첫 번째 페이지 요청 시 Turbopack이 해당 라우트를 컴파일한다(수 초~수십 초, 이후 캐시됨).

---

## Docker로 프론트 띄우기 (선택)

`docker-compose.yml`에는 프론트엔드만 정의되어 있다. API 서버와 PostgreSQL은 위 절차대로 호스트에서 직접 실행한다. 두 서비스 모두 호스트 3000 포트를 쓰므로 동시에 띄우지 않는다.

| 서비스 | 빌드 타깃 | 실행 | 용도 |
|---|---|---|---|
| `app` | `dev` | `next dev --turbopack` (소스 볼륨 마운트, `WATCHPACK_POLLING=true`) | 개발용. Windows에서도 핫 리로드 동작 |
| `app-prod` | `runner` (`profile: prod`) | standalone `node server.js` | 프로덕션 빌드 확인용 |

```bash
# 개발 컨테이너 기동 / 로그 / 종료
docker compose up -d
docker compose logs -f
docker compose down

# 프로덕션 이미지 빌드 + 기동
docker compose --env-file .env.local --profile prod up -d --build app-prod
```

`app-prod`는 `NEXT_PUBLIC_MAPBOX_TOKEN`·`NEXT_PUBLIC_LIVEKIT_URL`·`NEXT_PUBLIC_APP_URL`을 **빌드 인자**로 받아 번들에 굽는다. compose는 빌드 인자를 셸 환경변수에서 읽으므로 `--env-file .env.local`로 채워야 하며, 빠뜨리면 빈 값으로 빌드되어 미니맵·대시보드 지도가 뜨지 않는다. 코드를 바꾼 뒤에는 `--build`로 이미지를 다시 만들어야 반영된다. `NEXT_PUBLIC_WS_URL`은 빌드 인자에 없어 프로덕션 이미지는 기본값 `http://localhost:9001`로 소켓에 접속한다.

---

## 관련 문서

- [환경변수 레퍼런스](./env-vars.md)
- [클라우드 인프라 초기 셋업](./infra-setup.md)
- [개발 명령어](./commands.md)
