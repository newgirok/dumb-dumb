# ADR 008: 실시간 서버 분리 — socket.io 게이트웨이는 API 서버와 따로 둔다

**상태:** Accepted

## 결정

socket.io 게이트웨이 셋(`/room`·`/proximity`·`/sector`)은 API 서버(`apps/api`)와 다른 앱인 실시간 서버(`apps/realtime`, `@owcj/realtime`)에 둔다. API 서버는 REST만 맡아 포트 9001을, 실시간 서버는 포트 9002를 쓴다. 브라우저는 실시간 서버에 직접 붙는다(`NEXT_PUBLIC_WS_URL`, 기본 `http://localhost:9002`). 두 서버는 같은 저장소에 두고, DB는 [ADR 002](./002-self-hosted-backend.md)대로 API 서버만 쓴다.

## 배경

게이트웨이는 방·위치 상태를 프로세스 메모리에 든다. REST와 소켓을 한 프로세스에 두면 다음 문제가 생긴다.

- **REST 확장이 소켓에 묶인다.** 인스턴스를 늘리면 인스턴스끼리 서로 안 보이므로, 상태가 없는 REST까지 한 대로 묶인다.
- **배포가 함께 움직인다.** 결제·인증만 고쳐 배포해도 소켓 접속자가 전부 끊겼다 다시 붙고, 무중단 배포 중에는 이전 인스턴스와 새 인스턴스로 나뉜 사람끼리 서로 안 보인다.
- **이벤트 루프 하나를 나눠 쓴다.** 35ms 방송 틱(플레이 씬·내 주변)과 200ms 섹터 틱이 REST·결제 웹훅·2초 간격 발급 워커와 한 Node 프로세스에서 돌면, 한쪽이 무거워질 때 다른 쪽이 밀린다.
- **익명 소켓이 DB 설정에 묶인다.** `/room`·`/proximity`는 DB를 쓰지 않는데도, 같은 프로세스의 DB 풀이 부팅 때 `DATABASE_URL`을 요구한다.

## 근거

| 항목 | 한 서버에 함께 | 실시간 서버 분리 |
|---|---|---|
| REST 수평 확장 | 게이트웨이 메모리 상태 때문에 단일 인스턴스 | 상태가 없어 인스턴스를 늘릴 수 있다 |
| 배포 영향 | REST 배포마다 소켓 접속자 전원 재접속 | REST 배포는 소켓에 영향 없음 |
| 이벤트 루프 | 방송 틱·REST·웹훅·워커 공유 | 서버마다 따로 |
| 기동 조건 | `DATABASE_URL` 필수 | 실시간 서버는 설정 없이 뜬다(`/sector`만 `JWT_ACCESS_SECRET` 필요) |
| 운영 대상 | 서버 1종 | 서버 2종 (이미지·헬스 체크 각각) |

서비스별 DB·메시지 브로커·별도 저장소를 두는 본격 MSA는 택하지 않는다. ADR 002의 단일 공유 Postgres를 쓰고, 두 서버는 서로 부르지 않으며 `JWT_ACCESS_SECRET`만 함께 쓴다(API 서버가 발급하고 실시간 서버가 검증한다). NestJS REST 앱과 NestJS socket.io 앱을 한 저장소의 `apps/` 아래 나란히 두는 구성은 Novu(`apps/api`·`apps/ws`) 같은 오픈소스에서도 쓴다.

## 적용

- **실시간 서버** (`apps/realtime`): `/room`·`/proximity`·`/sector` 게이트웨이와 `GET /health`. 포트 9002(`PORT`)다. 의존성은 Nest 코어·config·jwt·socket.io뿐이다(DB 드라이버·bcrypt 없음). 게이트웨이는 `src/room/`·`src/proximity/`·`src/sector/`에 있다([ADR 009](./009-interest-management-naming.md)).
- **API 서버** (`apps/api`): 인증·유저·결제(웹훅·아바타 발급 워커 포함)·아바타·음성 토큰 REST. 포트 9001(`PORT`)이다. socket.io와 `shared/`를 쓰지 않고, 빌드 결과는 `dist/main`이다.
- **`/sector` 인증**: 토큰은 API 서버가 발급하고, 실시간 서버는 `AccessTokenVerifier`(`src/auth/access-token.ts`)로 같은 `JWT_ACCESS_SECRET`의 서명·만료와 토큰 종류(`type: 'access'`)만 확인한다. API 서버의 액세스 토큰 가드처럼 DB는 보지 않는다. 시크릿이 없으면 서버는 뜨고 `/sector` 접속만 거절한다.
- **CORS**: socket.io CORS는 `main.ts`의 어댑터가 설정 파일을 읽은 뒤 `WEB_ORIGIN`으로 넣는다. 게이트웨이 데코레이터에서 `process.env`를 읽으면 모듈을 불러오는 순간 값이 정해져, `.env.local`에만 둔 `WEB_ORIGIN`이 소켓에 반영되지 않기 때문이다.
- **계약**: 소켓 이벤트 계약은 `shared/`에 두고 프론트와 실시간 서버가 함께 import한다.
- **소켓 주소**: 브라우저의 소켓 기본 주소는 `http://localhost:9002`다(`lib/realtime/relay.ts`의 기본값, 프론트 `Dockerfile`의 빌드 인자 기본값, compose 빌드 인자 기본값, 루트 `.env.example`). ngrok으로 소켓을 내보낼 때 `/socket.io`를 넘기는 내부 엔드포인트의 upstream도 9002다.
- **Docker**: `apps/realtime/Dockerfile`(빌드 컨텍스트는 저장소 루트, 전용 `Dockerfile.dockerignore`)과 compose `realtime` 서비스(9002)를 둔다. 프론트 `app`이 `depends_on`으로 함께 띄운다.

## 주의

- 실시간 서버는 단일 인스턴스 전제다. 방·위치 상태가 프로세스 메모리에 있으므로, 늘리려면 socket.io 어댑터와 상태 공유(또는 방·지역 단위로 나누기)가 필요하다.
- 두 서버의 `JWT_ACCESS_SECRET`은 같은 값이어야 한다. 다르면 `/sector` 접속이 전부 거절된다.
- `NEXT_PUBLIC_WS_URL`은 실시간 서버(9002)를 가리켜야 한다. API 서버(9001)를 가리키면 브라우저가 소켓이 없는 서버에 붙으려다 실패해 씬이 혼자 돈다. 값은 번들에 구워지므로 바꾼 뒤에는 프론트를 다시 빌드한다.
- 저장소는 워크스페이스 도구 없이 앱별 폴더로 나눈 모노레포다. 패키지마다 따로 `npm install` 하고, 실시간 서버는 `shared/`를 상대 경로로 가져온다. 표준 구성(루트 워크스페이스, `apps/web`, `packages/shared`)은 로드맵의 별도 단계다.

## 관련

- [ADR 002: 자체 백엔드 — NestJS + 공유 Postgres](./002-self-hosted-backend.md)
- [ADR 009: 실시간 이름 — 받는 사람을 고르는 방식으로 부른다](./009-interest-management-naming.md)
- [아키텍처 개요 — 기술 스택](../architecture/overview.md)
- [로컬 환경 세팅](../onboarding/local-setup.md)
