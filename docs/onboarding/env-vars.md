# 환경변수 레퍼런스

환경변수는 두 곳에 나뉜다: 프론트엔드 루트 `.env.example`과 API 서버 `apps/api/.env.example`.

---

## 프론트엔드 (`.env.example`)

### 서버 주소 / 소켓

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `API_URL` | 필수 | `http://localhost:9001` | NestJS API 서버 주소. 서버 라우트(BFF 프록시)에서만 사용하므로 `NEXT_PUBLIC_` 아님 |
| `NEXT_PUBLIC_WS_URL` | 필수 | `http://localhost:9001` | 브라우저가 직접 붙는 월드 소켓(socket.io) 주소 |

### Mapbox

| 변수 | 필수 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | 필수 | Mapbox GL JS 공개 토큰. 도메인 락 필수 (프로덕션) |

### LiveKit

| 변수 | 필수 | 설명 |
|---|---|---|
| `LIVEKIT_API_KEY` | 필수 | LiveKit Cloud API Key (서버 전용) |
| `LIVEKIT_API_SECRET` | 필수 | LiveKit Cloud API Secret (서버 전용, Git 커밋 금지) |
| `NEXT_PUBLIC_LIVEKIT_URL` | 필수 | LiveKit 서버 WebSocket URL (`wss://...livekit.cloud`) |

### 결제 (PG)

| 변수 | 필수 | 설명 |
|---|---|---|
| `TOSS_CLIENT_KEY` | 선택 | 토스페이먼츠 클라이언트 키 |
| `TOSS_SECRET_KEY` | 선택 | 토스페이먼츠 시크릿 키 (서버 전용, Git 커밋 금지) |
| `KAKAO_PAY_CID` | 선택 | 카카오페이 가맹점 코드 |
| `KAKAO_PAY_SECRET` | 선택 | 카카오페이 어드민 키 (서버 전용, Git 커밋 금지) |

### AI (아바타 외형 생성)

| 변수 | 필수 | 설명 |
|---|---|---|
| `AI_API_KEY` | 선택 | 생성형 AI 아바타 외형 조합 API 키 |
| `AI_API_URL` | 선택 | 생성형 AI 엔드포인트 URL |

### 앱

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 필수 | `http://localhost:3000` | 서비스 도메인 |

---

## API 서버 (`apps/api/.env.example`)

### 데이터베이스

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `DATABASE_URL` | 필수 | `postgresql://app_api@localhost:5432/postgres` | API 서버 DB 접속 문자열. **반드시 `app_api` 롤**이어야 RLS가 적용된다 |
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
| `PG_WEBHOOK_SECRET` | 필수 | PG 웹훅 서명 검증 키 (raw body 검증). PG사 콘솔에서 발급 |

### 아바타 발급 워커

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `AVATAR_WORKER` | 선택 | `on` | `off`면 이 인스턴스는 발급을 처리하지 않는다 |
| `AVATAR_WORKER_INTERVAL_MS` | 선택 | `2000` | 발급 워커 폴링 주기(ms) |

### 소셜 로그인 (OAuth)

| 변수 | 필수 | 설명 |
|---|---|---|
| `KAKAO_CLIENT_ID` | 선택 | 카카오 REST API 키. 미설정이면 카카오 버튼이 400 반환 |
| `KAKAO_CLIENT_SECRET` | 선택 | 카카오는 client_secret이 선택 사항이라 비워도 됨 |
| `GOOGLE_CLIENT_ID` | 선택 | 구글 OAuth Client ID. 미설정이면 구글 버튼이 400 반환 |
| `GOOGLE_CLIENT_SECRET` | 선택 | 구글 OAuth Client Secret |

> 공급자 콘솔에 리다이렉트 URI를 등록해야 하며 등록값과 정확히 일치해야 한다:
> `http://localhost:3000/api/auth/oauth/kakao/callback`,
> `http://localhost:3000/api/auth/oauth/google/callback`

---

## 보안 주의사항

- `_SECRET`, `_KEY` 접미사 변수는 `.gitignore`에 포함된 `.env.local`에만 저장
- API 서버 시크릿(`DATABASE_URL`, `JWT_*`, `PG_WEBHOOK_SECRET`, OAuth/PG/LiveKit 시크릿)은 API 서버 환경변수 또는 호스팅 플랫폼의 시크릿 저장소에서 관리
- `NEXT_PUBLIC_` 접두사 변수는 브라우저에 노출되므로 시크릿 값 절대 사용 금지

---

## 관련 문서

- [로컬 환경 세팅](./local-setup.md)
- [API 키 설정](./api-keys.md)
- [보안 규격](../backend/security/encryption.md)
