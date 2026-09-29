# 로컬 환경 세팅

프론트엔드(Next.js)와 API 서버(NestJS), 그리고 자체 PostgreSQL을 로컬에서 함께 띄우는 절차다.

마을 씬(`/village`)·내 주변(`/neighborhood`)·에셋 미리보기(`/preview`)만 볼 때는 서버가 필요 없다(씬은 혼자 돈다). 의존성 설치 후 프론트엔드만 띄우면 되고, 펼침 지도(M)에 지도를 그리려면 `.env.local`에 `NEXT_PUBLIC_MAPBOX_TOKEN`만 넣으면 된다(없으면 지도 대신 "지도를 그릴 수 없어요" 쪽지가 뜨고 씬은 그대로 돈다). 같은 방·같은 동네의 다른 방문자를 보려면 API 서버를 띄운다. PostgreSQL은 API 서버의 인증·결제·발급 API에 필요하다(이 API를 쓰는 로그인·상점·대시보드 월드 화면은 다시 만들 예정이다).

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

`apps/api/.env.local`의 `DATABASE_URL`은 반드시 `app_api` 롤을 사용한다. 음성 룸 토큰 발급(`POST /voice/token`)을 쓰려면 `apps/api/.env.example`에 없는 `LIVEKIT_API_KEY`·`LIVEKIT_API_SECRET`을 `apps/api/.env.local`에 직접 추가한다(룸에 붙는 대시보드 월드 화면은 다시 만들 예정이다).

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

브라우저는 `NEXT_PUBLIC_WS_URL`(기본 `http://localhost:9001`)의 NestJS 소켓에 직접 붙는다. 마을 씬은 `/scene`에 토큰 없이 붙어 같은 방 아이들을 받고, 내 주변(베타)은 `/neighborhood`에 붙어 반경 200m 사람들을 받는다. API 서버를 띄우지 않으면 씬은 혼자 돌고, 브라우저 콘솔에 재시도마다(최대 10초 간격) WebSocket 연결 실패가 남는다. API 서버의 REST 엔드포인트는 지금 브라우저가 부르지 않으므로 `curl`로 확인한다.

---

## 6. 접속 확인

| 주소 | 확인 내용 |
|---|---|
| http://localhost:3000 | 선택 페이지(타이틀 화면). 제목 "Dumb Dumb" 아래 마을·내 주변·에셋 미리보기(`/preview`) 버튼 3개가 세로로 있다 |
| http://localhost:3000/village | 마을 씬. 로딩 화면(스피너·"마을을 불러오고 있어요") → 인트로 전환 → 3인칭 조작. 우상단에 버튼 3개(소리 / 옷 색 / 지도)가 뜨고, M이나 지도 버튼으로 펼침 지도를 펼친다(M·Esc로 접는다). 지도를 처음 펼칠 때 위치 권한을 묻고(이미 허용한 사이트면 들어올 때 바로 찾는다), 위치를 받기 전에는 빈 종이에 상태 쪽지만 뜬다. Mapbox 토큰이 없으면 지도 대신 "지도를 그릴 수 없어요" 쪽지가 뜨고 씬은 그대로 돈다 |
| http://localhost:3000/neighborhood | 내 주변(베타). 들어가면 바로 위치를 요청하고, 위치를 받을 때까지 대기 화면에서 기다린다(정해 둔 기본 좌표로 시작하지 않는다). ±50m 안 위치가 오면 바로 시작하고, 그보다 흐리면(와이파이·IP 추정 포함) 6초 더 다듬은 뒤 그 사이 가장 나은 위치로 이 근처에서 시작한다. 시작하면 내 위치 주변 실제 길이 깔리고 걷는 만큼 앞쪽이 이어 깔린다. 우상단 지도 버튼이나 M으로 펼침 지도를 펼친다. 길 데이터는 OpenFreeMap 타일을 브라우저가 직접 받는다(키 없음) |
| http://localhost:3000/preview | 에셋 미리보기(개발용). 에셋을 다 받을 때까지 로더("에셋을 불러오고 있어요")가 뜨고, ref-assets의 캐릭터·소품을 띄워 크기·본·애니메이션·인스턴스 규격을 확인한다 |
| http://localhost:9001/health | API 서버 헬스 → `{ "status": "ok" }` |

인증 게이팅이 없어 모든 페이지는 로그인 없이 열린다(`middleware.ts`의 `matcher`가 비어 있다). http://localhost:3000/api/health 는 Next 서버 자체의 응답이라 API 서버 상태를 반영하지 않는다.

위치(GPS)는 보안 연결(https 또는 localhost)에서만 된다. 휴대폰에서 PC의 `http://<IP>:3000`으로 열면 "https 필요" 상태가 되어 위치를 받지 못한다 — 마을 씬 지도에는 "https 필요" 도장이 찍히고, 내 주변은 대기 화면에서 넘어가지 않는다.

휴대폰에서 위치까지 확인하려면 ngrok으로 https 주소를 만든다 — 계정 토큰을 한 번 등록하고(`ngrok config add-authtoken <토큰>`) `ngrok http 3000`을 띄우면, 터미널과 http://127.0.0.1:4040 에 뜨는 `https://….ngrok-free.dev` 주소로 휴대폰에서 연다. 무료 계정은 처음 들어갈 때 ngrok 안내 페이지가 한 번 뜨고, "Visit Site"를 누르면 사이트가 열린다. 여러 기기에서 서로 보이게 하려면 소켓도 같은 주소로 내보낸다. 무료 계정은 도메인이 하나라, 한 에이전트에서 `/socket.io` 요청만 API 서버(9001)로 보내고 나머지는 3000으로 보낸다.

```yaml
# endpoints.yml — ngrok start --all --config "%LOCALAPPDATA%/ngrok/ngrok.yml" --config endpoints.yml
version: 3
endpoints:
  - name: ws
    url: https://ws.internal
    upstream:
      url: 9001
  - name: web
    url: https://<내 도메인>.ngrok-free.dev
    upstream:
      url: 3000
    traffic_policy:
      on_http_request:
        - expressions:
            - "req.url.path.startsWith('/socket.io')"
          actions:
            - type: forward-internal
              config:
                url: https://ws.internal
```

API 서버는 `WEB_ORIGIN=https://<내 도메인>.ngrok-free.dev`로 띄우고(CORS), 프론트는 `NEXT_PUBLIC_WS_URL=https://<내 도메인>.ngrok-free.dev`로 빌드한다(`app-prod`면 이 값을 셸에 두고 `--build`). 마을 씬 소켓(`/scene`)은 DB·로그인 없이 돈다.

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

`app-prod`는 `NEXT_PUBLIC_MAPBOX_TOKEN`·`NEXT_PUBLIC_LIVEKIT_URL`·`NEXT_PUBLIC_APP_URL`·`NEXT_PUBLIC_WS_URL`을 **빌드 인자**로 받아 번들에 굽는다. compose는 빌드 인자를 셸 환경변수에서 읽으므로 `--env-file .env.local`로 채워야 하며, 빠뜨리면 빈 값으로 빌드되어 펼침 지도에 지도 대신 "지도를 그릴 수 없어요" 쪽지만 뜬다. `NEXT_PUBLIC_WS_URL`만은 비어 있으면 `http://localhost:9001`로 굽는다 — 호스트에서 띄운 API 서버(9001)에 호스트 브라우저가 붙으므로 로컬 확인에는 그대로 쓰면 되고, 공개 도메인에 올릴 이미지는 API 서버 공개 주소를 넣어 빌드한다(localhost로 구운 페이지를 다른 주소에서 열면 마을 씬·내 주변은 소켓에 접속하지 않고 혼자 돈다). 코드를 바꾼 뒤에는 `--build`로 이미지를 다시 만들어야 반영된다.

---

## 관련 문서

- [환경변수 레퍼런스](./env-vars.md)
- [클라우드 인프라 초기 셋업](./infra-setup.md)
- [개발 명령어](./commands.md)
