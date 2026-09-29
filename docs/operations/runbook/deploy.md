# 배포 절차

클라우드 인프라가 아직 구축되지 않은 경우 [클라우드 인프라 초기 셋업](../../onboarding/infra-setup.md)을 먼저 완료하라.

---

## 배포 구성

| 컴포넌트 | 호스팅 | 트리거 |
|---|---|---|
| Next.js 프론트엔드 | Vercel | main 브랜치 push 시 자동 |
| Next.js 프론트엔드 (컨테이너) | `Dockerfile` `runner` 스테이지 (`output: 'standalone'`, `node server.js`) | 이미지 빌드 후 기동 |
| NestJS API 서버 (REST) | 자체 호스팅 (VM/컨테이너) | 수동 또는 CI 파이프라인 |
| NestJS 실시간 서버 (socket.io) | 자체 호스팅 (VM/컨테이너 — `apps/realtime/Dockerfile`) | 수동 또는 CI 파이프라인 |
| DB 마이그레이션 | 자체 PostgreSQL | psql로 SQL 순차 적용 |

배포 순서 원칙: **DB 마이그레이션 → API 서버 → 프론트엔드**. 스키마가 새 컬럼·테이블을
전제로 하는 API를 먼저 올리면 마이그레이션 이전 요청이 깨진다. 실시간 서버는 DB·API 서버와 무관해 따로 배포한다.
다만 소켓 계약(`shared/`)이 바뀐 배포에서는 프론트엔드보다 먼저 올린다.

---

## 1. 사전 준비

```bash
# 배포 대상 커밋을 빌드·타입 검증
npm run type-check
npm run build            # 프론트엔드

cd apps/api
npm run type-check
npm run build            # API 서버

cd ../realtime
npm run type-check
npm run build            # 실시간 서버
```

DB 접속 정보와 API 서버 환경변수가 프로덕션 값으로 준비되어 있는지 확인한다. API 서버는
반드시 테이블 소유자가 아닌 전용 롤 `app_api`로 접속해야 RLS가 적용된다
(`DATABASE_URL`의 유저가 `app_api`인지 확인).

---

## 2. DB 마이그레이션 배포

`supabase/migrations/`의 SQL(`0001`~`0010`)을 파일명 순서대로 프로덕션 PostgreSQL에 적용한다.
전용 CLI 러너는 없으며 psql로 직접 적용한다. PostGIS / pg_cron / pgcrypto / citext 확장이
설치되어 있어야 한다. Supabase가 아닌 PostgreSQL에 처음 적용할 때는 `0002`·`0004`가 참조하는 `auth.users` 스텁이
먼저 있어야 하고, 적용 뒤 `app_api` 로그인을 켠다([로컬 환경 세팅](../../onboarding/local-setup.md) 3-2·3-3).

```bash
# 예: 아직 적용되지 않은 마이그레이션을 순서대로 적용
psql "$DATABASE_URL_ADMIN" -f supabase/migrations/0010_bundle_fulfillment.sql
```

**주의**: 마이그레이션은 테이블 소유자 롤(관리 롤)로 적용한다. 애플리케이션 롤 `app_api`는
DDL 권한이 없다. 프로덕션 DB에 직접 영향을 주므로, 반드시 스테이징/로컬 DB에서 동일한
순서로 사전 검증한 뒤 실행하라.

롤백이 필요한 경우 이전 마이그레이션의 역연산 SQL을 새 마이그레이션 파일로 작성하여 적용한다.

---

## 3. API 서버 배포

빌드 산출물을 프로덕션 프로세스로 기동한다.

```bash
cd apps/api
npm ci
npm run build
npm run start:prod       # 컴파일된 dist/main 실행 (기본 포트 9001)
```

컨테이너로 운영하는 경우 위 build를 이미지 빌드 단계에서 수행하고, 런타임은 `start:prod`를
엔트리포인트로 둔다. 무중단 배포는 새 인스턴스가 `GET /health`에서 `ok`를 반환한 뒤
트래픽을 넘기고 구 인스턴스를 내리는 방식으로 한다. API 서버는 상태가 없어(소켓은 실시간 서버에 있다) 인스턴스를 늘려도 된다.

발급 워커는 API 서버 프로세스 안에서 `AVATAR_WORKER=on`일 때 동작한다. 워커를 켠 인스턴스가
최소 하나는 떠 있어야 결제 후 아바타 발급이 진행된다.

---

## 4. 실시간 서버 배포

```bash
cd apps/realtime
npm ci
npm run build
npm run start:prod       # 컴파일된 dist/apps/realtime/src/main 실행 (기본 포트 9002)
```

컨테이너로 운영하는 경우 저장소 루트를 빌드 컨텍스트로 `apps/realtime/Dockerfile`을 쓴다(`docker build -f apps/realtime/Dockerfile .`).
환경변수는 `WEB_ORIGIN`(프론트 도메인, socket.io CORS)과, `/sector`를 쓰면 API 서버와 같은 `JWT_ACCESS_SECRET`이다. DB 접속 정보는 필요 없다.

실시간 서버는 방·위치 상태를 프로세스 메모리에 두므로 **인스턴스 하나**로 운영한다. 새 인스턴스로 바꾸면 접속자는
모두 끊겼다가 다시 붙고(클라이언트가 스스로 재접속), 옛 인스턴스와 새 인스턴스가 함께 떠 있는 동안에는 나뉜 사람끼리
서로 안 보인다. 그래서 REST만 바뀐 배포에서는 실시간 서버를 다시 올리지 않는다.

---

## 5. API 서버 시크릿 갱신

시크릿 값이 변경된 경우에만, API 서버의 환경변수를 갱신하고 프로세스를 재기동한다.

```bash
# apps/api/.env.local 또는 apps/api/.env (또는 배포 플랫폼의 환경변수 설정)
DATABASE_URL=postgresql://app_api@<db-host>:5432/<db>
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...      # 액세스와 서로 다른 값
PG_WEBHOOK_SECRET=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

`JWT_ACCESS_SECRET`을 교체하면 발급된 액세스 토큰이 전부 무효가 되지만, 브라우저는 401을 받으면 리프레시 토큰(별도 시크릿)으로
새 액세스 토큰을 받아 재시도하므로 재로그인은 필요 없다. 실시간 서버에도 같은 값을 넣고 재기동한다 — 그 전까지는 새로
발급된 토큰으로 `/sector`에 붙지 못한다. 섹터 소켓은 접속할 때만 토큰을 검증하지만, 실시간 서버를 재기동하면 열린 소켓이 모두 다시 붙는다.
`JWT_REFRESH_SECRET`을 교체하면 리프레시 토큰이 전부 무효가 되어 재로그인이 필요하다.
소셜 로그인 리다이렉트 URI가 공급자 콘솔에 프로덕션 도메인으로 등록되어 있는지 확인한다.

---

## 6. 프론트엔드 배포 (Vercel)

Vercel과 GitHub 저장소가 연결되어 있으면 `main` 브랜치 push 시 자동 배포된다.

수동 배포가 필요한 경우:

```bash
npm install -g vercel
vercel --prod
```

Vercel 대시보드 → "Environment Variables"에서 다음이 설정되었는지 확인한다:
`NEXT_PUBLIC_WS_URL`(실시간 서버 — 플레이 씬·내 주변 소켓), `NEXT_PUBLIC_MAPBOX_TOKEN`(플레이 씬·내 주변 펼침 지도). `NEXT_PUBLIC_*` 값은 빌드 시점에 구워지므로
바꾼 뒤에는 재배포한다. 로그인·지도 월드·상점 화면을 다시 만들면 `API_URL`(서버 전용, BFF가 부르는 API 서버 주소)과
`NEXT_PUBLIC_LIVEKIT_URL`(지도 월드 음성)도 넣는다.

컨테이너로 배포할 때는 `docker-compose.yml`의 `app`으로 이미지를 만든다.
`NEXT_PUBLIC_*`는 빌드 인자로 구워지므로 `--env-file`로 채운다. `NEXT_PUBLIC_WS_URL`에는 실시간 서버 공개 주소를
넣는다. 비어 있으면 `http://localhost:9002`로 구워지고, 그 이미지를 공개 도메인에서 열면 플레이 씬·내 주변은
방문자 PC의 localhost로 붙지 않도록 소켓에 접속하지 않아 익명 멀티플레이가 꺼진 채(혼자) 돈다.

```bash
# app(프론트)과 realtime(실시간 서버)이 함께 빌드·기동된다
docker compose --env-file .env.local up -d --build
```

---

## 7. 배포 후 검증 체크리스트

- [ ] DB 마이그레이션 `0001`~`0010` 전부 적용됨 (psql로 스키마 확인)
- [ ] API 서버 헬스 정상 (API 서버 `GET /health` → `{ "status": "ok" }`)
- [ ] 실시간 서버 헬스 정상 (실시간 서버 `GET /health` → `{ "status": "ok" }`)
- [ ] 선택 페이지(`/`)에 플레이·내 주변·에셋 미리보기 버튼 3개가 세로로 보임
- [ ] 플레이 씬(`/play`) 로딩·인트로 정상, 우상단 지도 버튼이나 M으로 펼침 지도가 펼쳐지고 지도가 그려짐(토큰 없이 빌드하면 "지도를 그릴 수 없어요" 쪽지가 뜬다), 처음 펼칠 때 위치 권한을 허용하면 '나'가 표시됨
- [ ] 실시간 서버 섹터 게이트웨이(`/sector`) 접속 및 `positions` 수신 정상 (API 서버가 발급한 액세스 토큰을 실은 두 socket.io 클라이언트를 같은 섹터 좌표로 붙여 확인 — 두 서버의 `JWT_ACCESS_SECRET`이 다르면 끊긴다)
- [ ] 실시간 서버 방·근접 게이트웨이(`/room`·`/proximity`) 정상 (토큰 없이 두 클라이언트를 붙여 서로의 상태가 `states`로 오는지 — 내 주변은 서로 200m 안의 실제 좌표로)
- [ ] 내 주변(`/nearby`)에서 위치를 허용하면 대기 화면을 지나 바닥이 깔리고(흐린 위치만 오면 6초 뒤 그 근처에서 시작) 좌하단 출처 표기가 5초 보였다가 (i) 버튼으로 접힘(누르면 다시 보임) (OpenFreeMap 타일을 브라우저가 직접 받는다)
- [ ] Vercel 빌드 성공 (Vercel 대시보드 "Deployments")
- [ ] Mapbox 토큰 도메인 락 설정 (프로덕션 도메인만 허용)
- [ ] LiveKit API 키 유효성 확인 (액세스 토큰으로 API 서버 `POST /voice/token`을 불러 룸 토큰 발급 — 룸 연결 테스트는 지도 월드를 다시 만든 뒤)
- [ ] 결제 웹훅 URL이 프로덕션 API 서버 `POST /billing/webhook`으로 등록됨 (PG사 대시보드)
- [ ] API가 `app_api` 롤로 접속하여 `orders` 등 RLS 정책이 적용됨을 확인

---

## 관련 문서

- [클라우드 인프라 초기 셋업](../../onboarding/infra-setup.md)
- [모니터링](../monitoring.md)
- [과금 방어 대응](./billing-guard.md)
- [개발 명령어](../../onboarding/commands.md)
