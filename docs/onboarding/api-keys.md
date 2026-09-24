# API 키 설정 가이드

각 외부 서비스 키와 DB 접속·JWT 시크릿 발급 방법이다.

---

## Mapbox

1. https://account.mapbox.com 접속 → 계정 생성
2. "Tokens" 탭 → "Create a token"
3. **로컬 개발용**: 제한 없이 생성 후 `.env.local`에 저장
4. **프로덕션용**: "Allowed URLs"에 서비스 도메인만 등록 (도메인 락 필수)

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
```

이 토큰 하나를 대시보드 월드 지도와 루트 3D 씬의 5시 미니맵이 함께 쓴다. 무료 티어: 월 50,000 Map loads 무료. Mapbox 대시보드에서 사용량 알림 3단계 설정 권장.

---

## DB 접속 문자열 (`DATABASE_URL`)

API 서버는 테이블 소유자가 아닌 전용 롤 **`app_api`**로 접속해야 RLS(행 수준 보안)가 적용된다.

```
DATABASE_URL=postgresql://app_api:<password>@<host>:5432/<database>
```

- 로컬 예시: `postgresql://app_api:<비밀번호>@localhost:5432/postgres`
- `app_api` 롤 생성과 권한 부여는 [클라우드 인프라 초기 셋업](./infra-setup.md) 및 [로컬 환경 세팅](./local-setup.md) 참고
- 이 값은 API 서버 전용이며 브라우저에 노출되지 않는다(`apps/api/.env.local`에만 저장)

---

## JWT 시크릿

액세스/리프레시 토큰 서명에 쓰는 두 시크릿은 **반드시 서로 다른 값**으로 생성한다.

```bash
# 각각 따로 실행해 서로 다른 값을 얻는다
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```
JWT_ACCESS_SECRET=<32바이트 랜덤 hex>
JWT_REFRESH_SECRET=<다른 32바이트 랜덤 hex>
```

- 액세스 토큰 15분 / 리프레시 토큰 30일
- 시크릿을 교체하면 발급된 토큰이 일괄 무효화된다(`users.token_version`으로도 일괄 폐기 가능)
- 두 값 모두 API 서버 전용이며 절대 커밋 금지

---

## LiveKit Cloud

1. https://cloud.livekit.io 접속 → 프로젝트 생성
2. "Settings" → "Keys" 탭

```
LIVEKIT_API_KEY=APIxxxx           ← 서버 전용 (API 서버 환경변수)
LIVEKIT_API_SECRET=xxxx           ← 서버 전용 (API 서버 환경변수)
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud   ← 프론트 공개
```

룸 토큰은 NestJS `voice` 모듈이 `livekit-server-sdk`로 발급한다(TTL 1시간). `LIVEKIT_API_KEY`·`LIVEKIT_API_SECRET`은 `apps/api/.env.example`에 없으므로 `apps/api/.env.local`에 직접 추가한다. 음성은 대시보드 월드에서만 쓰인다. 무료 티어: 월 일정 분(分) 무료. 대시보드 사용량 알림 3단계 설정 권장.

---

## PG 웹훅

결제 완료는 PG 웹훅으로만 반영된다. API 서버의 `POST /billing/webhook`이 다음 규격을 받는다.

- 본문: `{ "orderId": "<주문 UUID>", "approvalNumber": "<승인번호>", "amountKrw": <금액> }`
- 헤더 `x-pg-signature`: raw body의 HMAC-SHA256 hex (키 `PG_WEBHOOK_SECRET`)
- 금액이 주문 금액과 다르거나 서명이 틀리면 반영하지 않는다

```
PG_WEBHOOK_SECRET=...          ← API 서버 전용
```

아래 토스페이먼츠·카카오페이 키는 PG 결제창 연동용이다. 결제창 호출 코드가 없어 현재 어느 코드도 이 키를 읽지 않는다.

## 토스페이먼츠

1. https://developers.tosspayments.com → 개발자 계정 등록
2. "개발 테스트" 환경의 클라이언트 키와 시크릿 키 사용 (로컬)
3. 프로덕션 전환 시 사업자 심사 후 운영 키 발급

```
TOSS_CLIENT_KEY=test_ck_...    ← 클라이언트 (테스트)
TOSS_SECRET_KEY=test_sk_...    ← 서버 전용 (테스트)
```

---

## 카카오페이

1. https://developers.kakao.com → 앱 등록
2. 카카오페이 API 사용 설정 → CID(가맹점 코드) 발급

```
KAKAO_PAY_CID=TC0ONETIME      ← 테스트용 고정값
KAKAO_PAY_SECRET=...           ← 서버 전용
```

---

## 카카오 / 구글 OAuth (소셜 로그인)

Authorization Code 흐름을 사용하며 코드 교환은 전부 서버에서 처리한다. 클라이언트 ID/시크릿은 API 서버 환경변수로 관리한다.

### 카카오

1. https://developers.kakao.com → 애플리케이션 추가 → "카카오 로그인" 활성화
2. REST API 키 → `KAKAO_CLIENT_ID` (`KAKAO_CLIENT_SECRET`은 선택)
3. Redirect URI 등록: `http://localhost:3000/api/auth/oauth/kakao/callback`

```
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...    ← 선택 (비워도 됨)
```

### 구글

1. https://console.cloud.google.com → "APIs & Services" → "Credentials"
2. "OAuth client ID" 생성 (Web application)
3. Authorized redirect URI 등록: `http://localhost:3000/api/auth/oauth/google/callback`

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...   ← 서버 전용
```

> 리다이렉트 URI는 공급자 콘솔 등록값과 정확히 일치해야 한다. 미설정 시 해당 공급자 로그인 버튼은 `/login?error=oauth_unavailable`로 돌아온다.

---

## 관련 문서

- [환경변수 레퍼런스](./env-vars.md)
- [클라우드 인프라 초기 셋업](./infra-setup.md)
- [모니터링 — 과금 알림](../operations/monitoring.md)
