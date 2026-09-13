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

4. 마이그레이션 적용: `supabase/migrations/`의 SQL을 `0001`~`0010` 순서대로 psql로 적용
5. **`app_api` 롤 생성**: API 서버는 테이블 소유자가 아닌 이 전용 롤로 접속해야 RLS가 적용된다.

```sql
CREATE ROLE app_api LOGIN PASSWORD '<강력한-비밀번호>';
GRANT CONNECT ON DATABASE <db> TO app_api;
GRANT USAGE ON SCHEMA public TO app_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_api;
```

→ 접속 문자열을 API 서버의 `DATABASE_URL`로 등록한다(예: `postgresql://app_api:<pw>@<host>:5432/<db>`).

---

## 2. API 서버 호스팅

NestJS API 서버(`apps/api`)를 호스팅한다.

1. 서버/컨테이너 환경에 Node.js 20 준비, `apps/api`에서 `npm install && npm run build`
2. `npm run start:prod`로 기동 (기본 `PORT=9001`)
3. **서버 시크릿은 API 서버 환경변수(또는 호스팅 플랫폼의 시크릿 저장소)로 관리**한다:
   `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `HASH_ROUNDS`,
   `PG_WEBHOOK_SECRET`, `KAKAO_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`,
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `TOSS_SECRET_KEY`, `KAKAO_PAY_SECRET` 등
4. WebSocket(월드 소켓, socket.io)이 이 서버에서 함께 서빙되므로 브라우저가 붙을 공개 주소를 확보한다 → 프론트 `NEXT_PUBLIC_WS_URL`에 등록
5. `WEB_ORIGIN`을 프론트 도메인으로 설정

---

## 3. Vercel 프로젝트 생성 (프론트)

1. [vercel.com](https://vercel.com) → "Add New Project"
2. GitHub 저장소 Import
3. Framework Preset: **Next.js** (자동 감지)
4. Root Directory: `.` (루트)
5. Environment Variables 등록 — **`NEXT_PUBLIC_*` 공개 변수만** 등록한다:

| 변수 | 값 출처 |
|---|---|
| `NEXT_PUBLIC_WS_URL` | API 서버 공개 주소 (월드 소켓) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox account.mapbox.com → Tokens |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit Settings → Keys |
| `NEXT_PUBLIC_APP_URL` | Vercel 배포 후 생성되는 도메인 |

> 서버 전용 시크릿과 `API_URL`(NestJS 내부 주소)은 프론트가 서버 라우트에서만 쓰므로 Vercel Project Environment Variables(비공개)로 등록하되, 브라우저에 노출되면 안 되는 값은 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

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

### 토스페이먼츠

1. [developers.tosspayments.com](https://developers.tosspayments.com) → 개발자 계정 등록
2. 테스트 클라이언트/시크릿 키 발급 → 프로덕션 전환 시 사업자 심사 후 운영 키
3. 웹훅 URL 등록: 결제 승인 웹훅을 API 서버(`billing` 모듈)로 향하게 설정
4. 웹훅 서명 검증 키를 `PG_WEBHOOK_SECRET`으로 등록

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
- [ ] API 서버 호스팅 + 서버 시크릿 등록
- [ ] Vercel 프로젝트 생성 + GitHub 연결 + `NEXT_PUBLIC_*` 등록
- [ ] LiveKit Cloud 프로젝트 생성 (지역: ap-northeast)
- [ ] 토스페이먼츠 / 카카오페이 콘솔 + 웹훅 URL + `PG_WEBHOOK_SECRET`
- [ ] 카카오 / 구글 OAuth 앱 등록 + 리다이렉트 URI 등록

---

## 관련 문서

- [API 키 설정](./api-keys.md)
- [환경변수 레퍼런스](./env-vars.md)
- [배포 절차](../operations/runbook/deploy.md)
