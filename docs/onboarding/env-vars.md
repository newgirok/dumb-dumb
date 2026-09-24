# 환경변수 레퍼런스

환경변수는 두 곳에 나뉜다: 프론트엔드 루트 `.env.example`과 API 서버 `apps/api/.env.example`.

---

## 프론트엔드 (`.env.example`)

### 코드가 읽는 변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `API_URL` | 필수 | `http://localhost:9001` | NestJS API 서버 주소. 서버 라우트(BFF 프록시)에서만 사용하므로 `NEXT_PUBLIC_` 아님 |
| `NEXT_PUBLIC_WS_URL` | 필수 | `http://localhost:9001` | 대시보드 월드가 브라우저에서 직접 붙는 월드 소켓(socket.io, `/world` 네임스페이스) 주소. Docker `app-prod` 빌드 인자에는 없어 프로덕션 이미지는 기본값을 쓴다 |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | 필수 | — | Mapbox GL JS 공개 토큰. 대시보드 월드 지도와 루트 3D 씬의 5시 미니맵이 함께 쓴다. 없으면 미니맵은 지도 없이 테두리만 남고 대시보드 월드 지도를 불러올 수 없다. 도메인 락 필수 (프로덕션) |
| `NEXT_PUBLIC_LIVEKIT_URL` | 필수 | — | LiveKit 서버 WebSocket URL (`wss://...livekit.cloud`). 대시보드 월드 음성이 접속한다 |

`NEXT_PUBLIC_*` 값은 빌드 시점에 번들에 구워진다. 값을 바꾸면 프론트엔드를 다시 빌드해야 한다.

### `.env.example`에 있으나 프론트엔드 코드가 읽지 않는 항목

| 변수 | 비고 |
|---|---|
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | 음성 룸 토큰은 API 서버가 발급하므로 **API 서버 환경변수**로 넣는다(아래 API 서버 절) |
| `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `KAKAO_PAY_CID`, `KAKAO_PAY_SECRET` | PG 결제창 연동용 키. 결제창 호출 코드가 없어 현재 어느 코드도 읽지 않는다(결제 완료는 PG 웹훅으로만 반영) |
| `AI_API_KEY`, `AI_API_URL` | 생성형 AI 아바타 외형 생성용. 외형은 API 서버가 팔레트 조합 + 난수 시드로 만든다 |
| `NEXT_PUBLIC_APP_URL` | 서비스 도메인. Docker `app-prod` 빌드 인자로만 전달되고 코드는 읽지 않는다 |

---

## API 서버 (`apps/api/.env.example`)

### 데이터베이스

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `DATABASE_URL` | 필수 | `postgresql://app_api:<비밀번호>@localhost:5432/postgres` | API 서버 DB 접속 문자열. **반드시 `app_api` 롤**이어야 RLS가 적용된다 |
| `DB_POOL_MAX` | 선택 | `10` | pg 커넥션 풀 최대 크기 |

### 인증 (JWT)

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | 필수 | — | 액세스 토큰 서명 시크릿 (15분). 리프레시와 **다른 값** |
| `JWT_REFRESH_SECRET` | 필수 | — | 리프레시 토큰 서명 시크릿 (30일). 액세스와 **다른 값** |
| `HASH_ROUNDS` | 필수 | `10` | bcrypt 비밀번호 해시 라운드 |

### 서버 실행

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `PORT` | 선택 | `9001` | API 서버 리슨 포트 |
| `WEB_ORIGIN` | 필수 | `http://localhost:3000` | 프론트 오리진 (CORS/쿠키) |

### 결제 웹훅

| 변수 | 필수 | 설명 |
|---|---|---|
| `PG_WEBHOOK_SECRET` | 필수 | PG 웹훅 서명 검증 키. `x-pg-signature` 헤더를 raw body의 HMAC-SHA256 hex와 대조한다. 없으면 모든 웹훅이 서명 검증에 실패한다 |

### 음성 (LiveKit)

`apps/api/.env.example`에는 없으므로 `apps/api/.env.local`에 직접 추가한다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `LIVEKIT_API_KEY` | 필수 | LiveKit Cloud API Key. `POST /voice/token`이 룸 토큰을 서명할 때 쓴다 (서버 전용) |
| `LIVEKIT_API_SECRET` | 필수 | LiveKit Cloud API Secret (서버 전용, Git 커밋 금지). 두 값이 없으면 음성 토큰 발급이 실패한다 |

### 아바타 발급 워커

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `AVATAR_WORKER` | 선택 | `on` | `off`면 이 인스턴스는 발급을 처리하지 않는다 |
| `AVATAR_WORKER_INTERVAL_MS` | 선택 | `2000` | 발급 워커 폴링 주기(ms) |

### 소셜 로그인 (OAuth)

| 변수 | 필수 | 설명 |
|---|---|---|
| `KAKAO_CLIENT_ID` | 선택 | 카카오 REST API 키. 미설정이면 카카오 버튼이 `/login?error=oauth_unavailable`로 돌아온다 |
| `KAKAO_CLIENT_SECRET` | 선택 | 카카오는 client_secret이 선택 사항이라 비워도 됨 |
| `GOOGLE_CLIENT_ID` | 선택 | 구글 OAuth Client ID. 미설정이면 구글 버튼이 `/login?error=oauth_unavailable`로 돌아온다 |
| `GOOGLE_CLIENT_SECRET` | 선택 | 구글 OAuth Client Secret |

> 공급자 콘솔에 리다이렉트 URI를 등록해야 하며 등록값과 정확히 일치해야 한다:
> `http://localhost:3000/api/auth/oauth/kakao/callback`,
> `http://localhost:3000/api/auth/oauth/google/callback`

---

## 보안 주의사항

- `_SECRET`, `_KEY` 접미사 변수는 `.gitignore`에 포함된 `.env.local`에만 저장
- API 서버 시크릿(`DATABASE_URL`, `JWT_*`, `PG_WEBHOOK_SECRET`, OAuth·LiveKit 시크릿)은 API 서버 환경변수 또는 호스팅 플랫폼의 시크릿 저장소에서 관리. API 서버는 `apps/api/.env.local` → `.env` 순으로 읽는다
- `NEXT_PUBLIC_` 접두사 변수는 브라우저에 노출되므로 시크릿 값 절대 사용 금지

---

## 관련 문서

- [로컬 환경 세팅](./local-setup.md)
- [API 키 설정](./api-keys.md)
- [보안 규격](../backend/security/encryption.md)
