# 로컬 환경 세팅

프론트엔드(Next.js)와 실시간 서버·API 서버(NestJS), 그리고 자체 PostgreSQL을 로컬에서 함께 띄우는 절차다.

플레이 씬(`/play`)·내 주변(`/nearby`)·에셋 미리보기(`/asset-viewer`)만 볼 때는 서버가 필요 없다(씬은 혼자 돈다). 의존성 설치 후 프론트엔드만 띄우면 되고, 펼침 지도(M)에 지도를 그리려면 `.env.local`에 `NEXT_PUBLIC_MAPBOX_TOKEN`만 넣으면 된다(없으면 지도 대신 "지도를 그릴 수 없어요" 쪽지가 뜨고 씬은 그대로 돈다). 같은 방·같은 동네의 다른 방문자를 보려면 실시간 서버(`apps/realtime`)를 띄운다(DB·환경변수 없이 뜬다). PostgreSQL은 API 서버(`apps/api`)의 인증·결제·발급 API에 필요하다(이 API를 쓰는 로그인·상점·맵 화면은 예정이다).

---

## 사전 요구사항

| 도구 | 버전 | 설치 방법 |
|---|---|---|
| Node.js | 20 이상 (Docker 이미지는 22) | https://nodejs.org |
| PostgreSQL | 16+ (PostGIS 포함) | https://www.postgresql.org / https://postgis.net |
| psql | PostgreSQL 클라이언트 | PostgreSQL 설치에 포함 |
| Docker Desktop | 최신 (프론트·실시간 서버 컨테이너 실행용, 선택) | https://docker.com |
| Git | 최신 | https://git-scm.com |

PostgreSQL에는 다음 확장이 필요하다: **PostGIS**, **pg_cron**, **pgcrypto**, **citext**.

---

## 1. 저장소 클론

```bash
git clone https://github.com/newgirok/dumb-dumb.git
cd dumb-dumb
```

---

## 2. 의존성 설치

프론트엔드(루트)·실시간 서버(`apps/realtime`)·API 서버(`apps/api`)의 의존성을 각각 설치한다(워크스페이스로 묶지 않아 폴더마다 따로 설치한다).

```bash
# 프론트엔드 (루트)
npm install

# 실시간 서버
cd apps/realtime
npm install
cd ../..

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

`apps/api/migrations/`의 SQL 파일을 **번호 순서대로** psql로 적용한다(전용 CLI 러너는 없다). `0002`·`0004`의 외래 키는 `auth.users`를 가리키고, `0006`이 이 참조를 `users` 테이블로 옮긴다. `0000_auth_users_stub.sql`이 `auth.users` 빈 스텁을 먼저 만들어 어떤 PostgreSQL에서도 순서대로 돈다(이미 있으면 아무 일도 하지 않는다).

```bash
for f in apps/api/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$f"
done
```

또는 개별 적용:

```bash
psql -U postgres -d postgres -f apps/api/migrations/0000_auth_users_stub.sql
psql -U postgres -d postgres -f apps/api/migrations/0001_init.sql
psql -U postgres -d postgres -f apps/api/migrations/0002_characters.sql
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

프론트엔드와 API 서버 각각에 `.env.local`을 만든다. 실시간 서버는 설정 없이 기본값(포트 9002, 오리진 `http://localhost:3000`)으로 뜨므로, 이 값을 바꾸거나 `/sector`를 쓸 때만 만든다(`JWT_ACCESS_SECRET`은 API 서버와 같은 값).

```bash
# 프론트엔드 (루트)
cp .env.example .env.local

# API 서버
cp apps/api/.env.example apps/api/.env.local

# 실시간 서버 (선택)
cp apps/realtime/.env.example apps/realtime/.env.local
```

`apps/api/.env.local`의 `DATABASE_URL`은 반드시 `app_api` 롤을 사용한다.

```env
DATABASE_URL=postgresql://app_api:<비밀번호>@localhost:5432/postgres
```

전체 항목 설명은 [환경변수 레퍼런스](./env-vars.md)를 참고하라.

---

## 5. 개발 서버 기동

실시간 서버·API 서버·프론트엔드를 각각 실행한다(터미널 3개). 다른 방문자만 보려면 API 서버 없이 실시간 서버와 프론트엔드만 띄운다.

```bash
# 터미널 1 — 실시간 서버 (NestJS socket.io, 9002 포트, watch 모드)
cd apps/realtime
npm run start:dev
```

```bash
# 터미널 2 — API 서버 (NestJS REST, 9001 포트, watch 모드)
cd apps/api
npm run start:dev
```

```bash
# 터미널 3 — 프론트엔드 (Next.js, 3000 포트, Turbopack)
npm run dev
```

브라우저는 `NEXT_PUBLIC_WS_URL`(기본 `http://localhost:9002`)의 실시간 서버 소켓에 직접 붙는다(9001은 소켓이 없는 API 서버다). 플레이 씬은 `/room`에 토큰 없이 붙어 같은 방 캐릭터들을 받고, 내 주변(베타)은 `/proximity`에 붙어 반경 200m 사람들을 받는다. 실시간 서버를 띄우지 않으면 씬은 혼자 돌고, 브라우저 콘솔에 재시도마다(최대 10초 간격) WebSocket 연결 실패가 남는다. API 서버의 REST 엔드포인트는 지금 브라우저가 부르지 않으므로 `curl`로 확인한다.

---

## 6. 접속 확인

| 주소 | 확인 내용 |
|---|---|
| http://localhost:3000 | 선택 페이지(타이틀 화면). 제목 "Dumb Dumb" 아래 플레이·내 주변·에셋 미리보기(`/asset-viewer`) 버튼 3개가 세로로 있다 |
| http://localhost:3000/play | 플레이 씬. 로딩 화면(스피너·"게임을 불러오고 있어요") → 인트로 전환 → 3인칭 조작. 우상단에 버튼 4개(소리 / 옷 색 / 지도 / 말 걸기 받기)가 뜨고, M이나 지도 버튼으로 펼침 지도를 펼친다(M·Esc로 접는다). 실시간 서버를 띄우고 창 두 개로 열어 캐릭터끼리 가까이 서면 머리 위에 말 걸기 버튼이 뜨고, 한쪽이 걸고(E) 다른 쪽이 받아들이면 만남 대화 창이 열린다. 지도를 처음 펼칠 때 위치 권한을 묻고(이미 허용한 사이트면 들어올 때 바로 찾는다), 위치를 받기 전에는 빈 종이에 상태 쪽지만 뜬다. Mapbox 토큰이 없으면 지도 대신 "지도를 그릴 수 없어요" 쪽지가 뜨고 씬은 그대로 돈다 |
| http://localhost:3000/nearby | 내 주변(베타). 들어가면 바로 위치를 요청하고, 위치를 받을 때까지 대기 화면에서 기다린다(정해 둔 기본 좌표로 시작하지 않는다). ±50m 안 위치가 오면 바로 시작하고, 그보다 흐리면(와이파이·IP 추정 포함) 6초 더 다듬은 뒤 그 사이 가장 나은 위치로 이 근처에서 시작한다. 시작하면 내 위치 주변 실제 길이 깔리고 걷는 만큼 앞쪽이 이어 깔린다. 우상단 지도 버튼이나 M으로 펼침 지도를 펼친다. 길 데이터는 OpenFreeMap 타일을 브라우저가 직접 받는다(키 없음) |
| http://localhost:3000/asset-viewer | 에셋 미리보기(개발용). 에셋을 다 받을 때까지 로더("에셋을 불러오고 있어요")가 뜨고, ref-assets의 캐릭터·소품을 띄워 크기·본·애니메이션·인스턴스 규격을 확인한다 |
| http://localhost:9001/health | API 서버 헬스 → `{ "status": "ok" }` |
| http://localhost:9002/health | 실시간 서버 헬스 → `{ "status": "ok" }` |

인증 게이팅이 없어 모든 페이지는 로그인 없이 열린다(`middleware.ts`의 `matcher`가 비어 있다). http://localhost:3000/api/health 는 Next 서버 자체의 응답이라 실시간 서버·API 서버 상태를 반영하지 않는다.

위치(GPS)는 보안 연결(https 또는 localhost)에서만 된다. 휴대폰에서 PC의 `http://<IP>:3000`으로 열면 "https 필요" 상태가 되어 위치를 받지 못한다 — 플레이 씬 지도에는 "https 필요" 도장이 찍히고, 내 주변은 대기 화면에서 넘어가지 않는다.

휴대폰에서 위치까지 확인하려면 ngrok으로 https 주소를 만든다 — 계정 토큰을 한 번 등록하고(`ngrok config add-authtoken <토큰>`) `ngrok http 3000`을 띄우면, 터미널과 http://127.0.0.1:4040 에 뜨는 `https://….ngrok-free.dev` 주소로 휴대폰에서 연다. 무료 계정은 처음 들어갈 때 ngrok 안내 페이지가 한 번 뜨고, "Visit Site"를 누르면 사이트가 열린다. 여러 기기에서 서로 보이게 하려면 소켓도 같은 주소로 내보낸다. 무료 계정은 도메인이 하나라, 한 에이전트에서 `/socket.io` 요청만 실시간 서버(9002)로 보내고 나머지는 3000으로 보낸다.

```yaml
# endpoints.yml — ngrok start --all --config "%LOCALAPPDATA%/ngrok/ngrok.yml" --config endpoints.yml
version: 3
endpoints:
  - name: ws
    url: https://ws.internal
    upstream:
      url: 9002
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

실시간 서버는 `WEB_ORIGIN=https://<내 도메인>.ngrok-free.dev`로 띄우고(socket.io CORS), 프론트는 `NEXT_PUBLIC_WS_URL=https://<내 도메인>.ngrok-free.dev`로 빌드한다(Docker `app`이면 이 값을 셸에 두고 `--build`). 플레이 씬 소켓(`/room`)은 DB·로그인 없이 돈다.

첫 번째 페이지 요청 시 Turbopack이 해당 라우트를 컴파일한다(수 초~수십 초, 이후 캐시됨).

---

## Docker로 프론트·실시간 서버 띄우기 (선택)

`docker-compose.yml`에는 프론트엔드 `app`과 실시간 서버 `realtime` 두 서비스가 있다. `app`은 프로덕션 빌드(standalone)를 띄워 확인하는 용도이고, `depends_on`으로 `realtime`(9002)을 함께 띄운다(호스트에서 실시간 서버를 따로 띄워 두었다면 9002가 겹치니 먼저 끈다). 핫 리로드 개발은 5절처럼 호스트에서 `npm run dev`로 한다. API 서버와 PostgreSQL은 위 절차대로 호스트에서 직접 실행한다.

| 서비스 | 빌드 | 실행 | 용도 |
|---|---|---|---|
| `app` | `Dockerfile` (builder → runner) | standalone `node server.js` (3000) | 프론트 프로덕션 빌드 확인용 |
| `realtime` | `apps/realtime/Dockerfile` (컨텍스트는 저장소 루트) | `node dist/apps/realtime/src/main` (9002) | 실시간 서버. DB 없이 뜨고, `WEB_ORIGIN`(기본 `http://localhost:3000`)·`JWT_ACCESS_SECRET`(기본 빈 값 — `/sector` 접속만 거절)을 셸이나 `--env-file`에서 받는다 |

```bash
# 이미지 빌드 + 기동 (app + realtime)
docker compose --env-file .env.local up -d --build

# 로그 / 종료
docker compose logs -f
docker compose down
```

서비스는 앱마다 하나만 둔다. 환경마다 다른 설정이 생기면 override 파일로 나누고(`compose.override.yaml`은 자동으로 합쳐지고, `compose.production.yaml`은 `-f`로 얹는다), 프로필은 디버그 도구·마이그레이션 같은 선택 서비스에만 쓴다(Docker 문서 — 앱의 핵심 서비스에는 프로필을 달지 않는다).

`app`은 `NEXT_PUBLIC_MAPBOX_TOKEN`·`NEXT_PUBLIC_APP_URL`·`NEXT_PUBLIC_WS_URL`을 **빌드 인자**로 받아 번들에 굽는다. compose는 빌드 인자를 셸 환경변수에서 읽으므로 `--env-file .env.local`로 채워야 하며, 빠뜨리면 빈 값으로 빌드되어 펼침 지도에 지도 대신 "지도를 그릴 수 없어요" 쪽지만 뜬다. `NEXT_PUBLIC_WS_URL`만은 비어 있으면 `http://localhost:9002`로 굽는다 — 함께 뜬 실시간 서버(9002)에 호스트 브라우저가 붙으므로 로컬 확인에는 그대로 쓰면 되고, 공개 도메인에 올릴 이미지는 실시간 서버 공개 주소를 넣어 빌드한다(localhost로 구운 페이지를 다른 주소에서 열면 플레이 씬·내 주변은 소켓에 접속하지 않고 혼자 돈다). 코드를 바꾼 뒤에는(실시간 서버 코드 포함) `--build`로 이미지를 다시 만들어야 반영된다.

---

## 관련 문서

- [환경변수 레퍼런스](./env-vars.md)
- [클라우드 인프라 초기 셋업](./infra-setup.md)
- [개발 명령어](./commands.md)
