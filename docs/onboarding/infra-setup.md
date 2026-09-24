# 클라우드 인프라 초기 셋업

Phase 0에서 1회 실행하는 인프라 초기 설정 절차. 데이터베이스·API 서버·프론트 배포·실시간 음성·결제·소셜 로그인을 프로비저닝한다.

---

## 1. PostgreSQL 프로비저닝

자체 호스팅 PostgreSQL 또는 관리형 Postgres를 준비한다. 서비스가 늘어도 **단일 공유 DB** 하나를 쓴다.

1. PostgreSQL 16+ 인스턴스 생성 (자체 호스팅 서버 또는 관리형 Postgres)
2. 지역: 서비스 리전에 최근접(예: 서울)
3. 필수 확장 활성화:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
```

> `pg_cron`은 `shared_preload_libraries`에 등록 후 재시작해야 활성화된다. 광고 활성/비활성 스케줄(`activate-ads`, 매일 15:00 UTC=00:00 KST)에 사용된다.

4. 마이그레이션 적용: `supabase/migrations/`의 SQL을 관리 롤로 `0001`~`0010` 순서대로 psql로 적용한다. Supabase가 아닌 PostgreSQL이면 먼저 `0002`·`0004`가 참조하는 `auth.users` 스텁을 만든다(`CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);` — `0006`이 이 참조를 자체 `users`로 옮긴다)
5. **`app_api` 롤 로그인 활성화**: API 서버는 테이블 소유자가 아닌 이 전용 롤로 접속해야 RLS가 적용된다. 롤과 테이블·시퀀스 권한은 `0007_rls.sql`이 `NOLOGIN`으로 만들어 두므로, 마이그레이션 뒤 로그인만 켠다.

```sql
ALTER ROLE app_api WITH LOGIN PASSWORD '<강력한-비밀번호>';
GRANT CONNECT ON DATABASE <db> TO app_api;
```

→ 접속 문자열을 API 서버의 `DATABASE_URL`로 등록한다(예: `postgresql://app_api:<pw>@<host>:5432/<db>`).

---

## 2. API 서버 호스팅

NestJS API 서버(`apps/api`)를 호스팅한다.

1. 서버/컨테이너 환경에 Node.js 20 이상 준비, `apps/api`에서 `npm install && npm run build`
2. `npm run start:prod`로 기동 (기본 `PORT=9001`). 헬스 프로브는 `GET /health`
3. **서버 시크릿은 API 서버 환경변수(또는 호스팅 플랫폼의 시크릿 저장소)로 관리**한다:
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `HASH_ROUNDS`,
   `PG_WEBHOOK_SECRET`, `KAKAO_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`,
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
4. WebSocket(대시보드 월드 소켓, socket.io `/world` 네임스페이스)이 이 서버에서 함께 서빙되므로 브라우저가 붙을 공개 주소를 확보한다 → 프론트 `NEXT_PUBLIC_WS_URL`에 등록
5. `WEB_ORIGIN`을 프론트 도메인으로 설정 (HTTP CORS·소켓 CORS 허용 오리진). 소켓 CORS는 게이트웨이 데코레이터가 `.env.local`을 읽기 전에 평가되므로, 파일이 아닌 서버 프로세스 환경변수(호스트·컨테이너 환경)로 넣는다

---

## 3. Vercel 프로젝트 생성 (프론트)

1. [vercel.com](https://vercel.com) → "Add New Project"
2. GitHub 저장소 Import
3. Framework Preset: **Next.js** (자동 감지)
4. Root Directory: `.` (루트)
5. Environment Variables 등록 — 아래 `NEXT_PUBLIC_*` 공개 변수와 서버 전용 `API_URL`을 등록한다:

| 변수 | 값 출처 |
|---|---|
| `NEXT_PUBLIC_WS_URL` | API 서버 공개 주소 (대시보드 월드 소켓) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox account.mapbox.com → Tokens (대시보드 월드 지도 + 루트 3D 씬 미니맵) |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit Settings → Keys |
| `API_URL` | NestJS API 서버 주소 (BFF 프록시 대상, 서버 전용 — 비우면 `http://localhost:9001`로 프록시) |

> `API_URL`은 서버 라우트(BFF 프록시)에서만 쓰는 비공개 값이라 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 브라우저에 노출되면 안 되는 값에는 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. `NEXT_PUBLIC_*` 값은 빌드 시점에 구워지므로 바꾼 뒤에는 재배포한다.

6. "Deploy" → 첫 빌드 실행

---

## 4. LiveKit Cloud 프로젝트 생성

1. [cloud.livekit.io](https://cloud.livekit.io) → "Create a project"
2. 프로젝트 이름 설정
3. 지역: **ap-northeast** (한국 최근접)
4. "Settings" → "Keys" → API Key + API Secret 발급
5. WebSocket URL 확인: `wss://your-project.livekit.cloud`

→ `NEXT_PUBLIC_LIVEKIT_URL`은 프론트에, `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`은 **API 서버 환경변수**에 등록한다(룸 토큰은 NestJS `voice` 모듈이 `livekit-server-sdk`로 발급).

---

## 5. PG(결제) 콘솔

결제 완료는 PG 웹훅으로만 반영된다. 웹훅 URL은 BFF를 거치지 않는 API 서버 주소 `POST https://<API 서버>/billing/webhook`이며, `x-pg-signature` 헤더에 raw body의 HMAC-SHA256 hex(키 `PG_WEBHOOK_SECRET`)를 실어 `{ orderId, approvalNumber, amountKrw }`를 보내야 한다. 결제창 호출 코드는 없어 아래 PG 키들은 현재 어느 코드도 읽지 않는다.

### 토스페이먼츠

1. [developers.tosspayments.com](https://developers.tosspayments.com) → 개발자 계정 등록
2. 테스트 클라이언트/시크릿 키 발급 → 프로덕션 전환 시 사업자 심사 후 운영 키
3. 웹훅 URL 등록: 위 API 서버 `billing/webhook` 경로
4. 웹훅 서명 검증 키를 API 서버 `PG_WEBHOOK_SECRET`으로 등록

### 카카오페이

1. [developers.kakao.com](https://developers.kakao.com) → 앱 등록 → 카카오페이 API 사용 설정
2. CID(가맹점 코드) 발급, 어드민 키 확보
3. `KAKAO_PAY_CID` / `KAKAO_PAY_SECRET` 등록

---

## 6. OAuth 앱 등록 (카카오 / 구글)

소셜 로그인은 카카오/구글 OAuth 2.0 Authorization Code 흐름을 사용하며, 코드 교환은 전부 서버에서 처리한다.

### 카카오

1. [developers.kakao.com](https://developers.kakao.com) → 애플리케이션 추가
2. "카카오 로그인" 활성화 → REST API 키를 `KAKAO_CLIENT_ID`로 사용 (`KAKAO_CLIENT_SECRET`은 선택)
3. **Redirect URI 등록**: `http://localhost:3000/api/auth/oauth/kakao/callback` (프로덕션은 실제 도메인)

### 구글

1. [Google Cloud Console](https://console.cloud.google.com) → "APIs & Services" → "Credentials"
2. "OAuth client ID" 생성 (Application type: Web application)
3. Client ID/Secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
4. **Authorized redirect URI 등록**: `http://localhost:3000/api/auth/oauth/google/callback` (프로덕션은 실제 도메인)

> 리다이렉트 URI는 콘솔 등록값과 정확히 일치해야 한다. OAuth 관련 클라이언트 ID/시크릿은 모두 API 서버 환경변수로 관리한다.

---

## 완료 체크리스트

- [ ] PostgreSQL 프로비저닝 (확장 4종 + 마이그레이션 0001~0010 적용)
- [ ] `app_api` 롤 생성 + 권한 부여
- [ ] API 서버 호스팅 + 서버 시크릿 등록 (LiveKit 키 포함) + `GET /health` 응답 확인
- [ ] Vercel 프로젝트 생성 + GitHub 연결 + `NEXT_PUBLIC_*` 등록
- [ ] LiveKit Cloud 프로젝트 생성 (지역: ap-northeast)
- [ ] 토스페이먼츠 / 카카오페이 콘솔 + 웹훅 URL + `PG_WEBHOOK_SECRET`
- [ ] 카카오 / 구글 OAuth 앱 등록 + 리다이렉트 URI 등록

---

## 관련 문서

- [API 키 설정](./api-keys.md)
- [환경변수 레퍼런스](./env-vars.md)
- [배포 절차](../operations/runbook/deploy.md)
