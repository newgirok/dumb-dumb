# ADR 008: 실시간 서버 분리 — socket.io 게이트웨이를 API 서버에서 떼어 낸다

**상태:** Accepted — 네임스페이스·폴더 이름(옛 `/scene`·`/nearby`·`/world`)은 [ADR 009](./009-interest-management-naming.md)로 대체

## 결정

socket.io 게이트웨이 셋(`/room`·`/proximity`·`/sector`)을 API 서버(`apps/api`)에서 떼어 별도 앱인 실시간 서버(`apps/realtime`, `@owcj/realtime`)로 옮긴다. API 서버는 REST 전용이 되어 지금 포트 9001을 그대로 쓰고(`API_URL`·헬스 주소가 그대로다), 실시간 서버는 새 포트 9002를 쓴다. 그래서 브라우저가 붙는 소켓 주소(`NEXT_PUBLIC_WS_URL` 기본값)가 9001에서 9002로 바뀐다. 두 서버는 같은 저장소에 두고, DB는 [ADR 002](./002-self-hosted-backend.md)대로 API 서버만 쓴다.

## 배경

ADR 002는 실시간을 API 서버 안의 socket.io 게이트웨이로 두었다. 게이트웨이는 방·위치 상태를 프로세스 메모리에 들고 있어서, 이 배치에서는 다음 문제가 생긴다.

- **REST 확장이 소켓에 묶인다.** 인스턴스를 늘리면 인스턴스끼리 서로 안 보이므로, 상태가 없는 REST까지 한 대로 묶였다(API 서버 수평 확장은 게이트웨이 단일 인스턴스 제약을 풀어야 했다).
- **배포가 함께 움직인다.** 결제·인증만 고쳐 배포해도 소켓 접속자가 전부 끊겼다 다시 붙고, 무중단 배포 중에는 옛 인스턴스와 새 인스턴스로 나뉜 사람끼리 서로 안 보인다.
- **이벤트 루프 하나를 나눠 쓴다.** 35ms 방송 틱(플레이 씬·내 주변)과 200ms 섹터 틱이 REST·결제 웹훅·2초 간격 발급 워커와 한 Node 프로세스에서 돈다. 한쪽이 무거워지면 다른 쪽이 밀린다.
- **익명 소켓이 DB 설정에 묶인다.** `/room`·`/proximity`는 DB를 쓰지 않는데도, 같은 프로세스의 DB 풀이 부팅 때 `DATABASE_URL`을 필수로 읽어 없으면 뜨지 못했다.

## 근거

| 항목 | API 서버 안 게이트웨이 (ADR 002) | 실시간 서버 분리 |
|---|---|---|
| REST 수평 확장 | 게이트웨이 메모리 상태 때문에 단일 인스턴스 | 상태가 없어 인스턴스를 늘릴 수 있다 |
| 배포 영향 | REST 배포마다 소켓 접속자 전원 재접속 | REST 배포는 소켓에 영향 없음 |
| 이벤트 루프 | 방송 틱·REST·웹훅·워커 공유 | 서버마다 따로 |
| 기동 조건 | `DATABASE_URL` 필수 | 실시간 서버는 설정 없이 뜬다(`/sector`만 `JWT_ACCESS_SECRET` 필요) |
| 운영 대상 | 서버 1종 | 서버 2종 (이미지·헬스 체크 각각) |

서비스별 DB·메시지 브로커·별도 저장소를 두는 본격 MSA는 택하지 않는다. ADR 002의 단일 공유 Postgres를 그대로 두고, 두 서버는 서로 부르지 않으며 `JWT_ACCESS_SECRET`만 함께 쓴다(API 서버가 발급하고 실시간 서버가 검증한다). NestJS REST 앱과 NestJS socket.io 앱을 한 저장소의 `apps/` 아래 나란히 두는 구성은 Novu(`apps/api`·`apps/ws`) 같은 오픈소스에서도 쓴다.

## 적용

- **실시간 서버** (`apps/realtime`): `/room`·`/proximity`·`/sector` 게이트웨이와 `GET /health`. 포트 9002(`PORT`)이고, 브라우저는 `NEXT_PUBLIC_WS_URL`(기본 `http://localhost:9002`)로 직접 붙는다. 의존성은 Nest 코어·config·jwt·socket.io뿐이다(DB 드라이버·bcrypt 없음). 게이트웨이 코드는 API 서버에서 그대로 옮겼다. 폴더(`src/room/`·`src/proximity/`·`src/sector/`)와 네임스페이스 이름은 [ADR 009](./009-interest-management-naming.md)를 따른다.
- **API 서버** (`apps/api`): 인증·유저·결제(웹훅·아바타 발급 워커 포함)·아바타·음성 토큰 REST. 포트는 지금처럼 9001(`PORT`)이다. socket.io 의존성을 뺐고, `shared/`를 더 쓰지 않아 빌드 결과가 `dist/main`이다.
- **`/sector` 인증**: 토큰은 API 서버가 발급하고, 실시간 서버는 `AccessTokenVerifier`(`src/auth/access-token.ts`)로 같은 `JWT_ACCESS_SECRET`의 서명·만료와 토큰 종류(`type: 'access'`)만 확인한다. API 서버의 액세스 토큰 가드처럼 DB는 보지 않는다. 시크릿이 없으면 서버는 뜨고 `/sector` 접속만 거절한다.
- **CORS**: socket.io CORS는 `main.ts`의 어댑터가 설정 파일을 읽은 뒤 `WEB_ORIGIN`으로 넣는다. 게이트웨이 데코레이터에서 `process.env`를 읽던 때는 모듈을 불러오는 순간 값이 정해져, `.env.local`에만 둔 `WEB_ORIGIN`이 소켓에 반영되지 않았다.
- **계약**: 소켓 이벤트 계약은 지금처럼 `shared/`에 두고 프론트와 실시간 서버가 함께 import한다.
- **소켓 주소**: 브라우저의 소켓 기본 주소를 `http://localhost:9002`로 바꾼다(`lib/realtime/relay.ts`의 기본값, 프론트 `Dockerfile`의 빌드 인자 기본값, compose 빌드 인자 기본값, 루트 `.env.example`). ngrok으로 소켓을 내보낼 때 `/socket.io`를 넘기는 내부 엔드포인트의 upstream도 9002다.
- **Docker**: `apps/realtime/Dockerfile`(빌드 컨텍스트는 저장소 루트, 전용 `Dockerfile.dockerignore`)과 compose `realtime` 서비스(9002)를 둔다. 프론트 `app`이 `depends_on`으로 함께 띄운다.

## 주의

- 실시간 서버는 여전히 단일 인스턴스 전제다. 방·위치 상태가 프로세스 메모리에 있으므로, 늘리려면 socket.io 어댑터와 상태 공유(또는 방·지역 단위로 나누기)가 필요하다.
- 두 서버의 `JWT_ACCESS_SECRET`은 같은 값이어야 한다. 다르면 `/sector` 접속이 전부 거절된다.
- 소켓 주소가 9001에서 9002로 바뀌었다. 예전 `.env.example`로 만든 `.env.local`에 `NEXT_PUBLIC_WS_URL=http://localhost:9001`이 남아 있으면 브라우저가 소켓이 없는 API 서버에 붙으려다 실패해 씬이 혼자 돈다. 9002로 고치고 프론트를 다시 빌드한다(값이 번들에 구워진다).
- 저장소는 워크스페이스 도구 없이 앱별 폴더로 나눈 모노레포다. 패키지마다 따로 `npm install` 하고, 실시간 서버는 `shared/`를 상대 경로로 가져온다. 표준 구성(루트 워크스페이스, `apps/web`, `packages/shared`)으로 옮기는 일은 따로 다룬다.

## 관련

- [ADR 002: 자체 백엔드 — NestJS + 공유 Postgres](./002-self-hosted-backend.md)
- [ADR 009: 실시간 이름 — 받는 사람을 고르는 방식으로 부른다](./009-interest-management-naming.md)
- [아키텍처 개요 — 기술 스택](../architecture/overview.md)
- [로컬 환경 세팅](../onboarding/local-setup.md)
