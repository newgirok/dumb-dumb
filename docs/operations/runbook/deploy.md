# 배포 절차

클라우드 인프라가 아직 구축되지 않은 경우 [클라우드 인프라 초기 셋업](../../onboarding/infra-setup.md)을 먼저 완료하라.

---

## 배포 구성

| 컴포넌트 | 호스팅 | 트리거 |
|---|---|---|
| Next.js 프론트엔드 | Vercel | main 브랜치 push 시 자동 |
| NestJS API 서버 | 자체 호스팅 (VM/컨테이너) | 수동 또는 CI 파이프라인 |
| DB 마이그레이션 | 자체 PostgreSQL | psql로 SQL 순차 적용 |

배포 순서 원칙: **DB 마이그레이션 → API 서버 → 프론트엔드**. 스키마가 새 컬럼·테이블을
전제로 하는 API를 먼저 올리면 마이그레이션 이전 요청이 깨진다.

---

## 1. 사전 준비

```bash
# 배포 대상 커밋을 빌드·타입 검증
npm run type-check
npm run build            # 프론트엔드

cd apps/api
npm run type-check
npm run build            # API 서버
```

DB 접속 정보와 API 서버 환경변수가 프로덕션 값으로 준비되어 있는지 확인한다. API 서버는
반드시 테이블 소유자가 아닌 전용 롤 `app_api`로 접속해야 RLS가 적용된다
(`DATABASE_URL`의 유저가 `app_api`인지 확인).

---

## 2. DB 마이그레이션 배포

`supabase/migrations/`의 SQL(`0001`~`0010`)을 파일명 순서대로 프로덕션 PostgreSQL에 적용한다.
전용 CLI 러너는 없으며 psql로 직접 적용한다. PostGIS / pg_cron / pgcrypto / citext 확장이
설치되어 있어야 한다.

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
npm run start:prod       # 컴파일된 dist 실행
```

컨테이너로 운영하는 경우 위 build를 이미지 빌드 단계에서 수행하고, 런타임은 `start:prod`를
엔트리포인트로 둔다. 무중단 배포는 새 인스턴스가 `GET /health`에서 `ok`를 반환한 뒤
트래픽을 넘기고 구 인스턴스를 내리는 방식으로 한다.

발급 워커는 API 서버 프로세스 안에서 `AVATAR_WORKER=on`일 때 동작한다. 워커를 켠 인스턴스가
최소 하나는 떠 있어야 결제 후 아바타 발급이 진행된다.

---

## 4. API 서버 시크릿 갱신

시크릿 값이 변경된 경우에만, API 서버의 환경변수를 갱신하고 프로세스를 재기동한다.

```bash
# apps/api/.env (또는 배포 플랫폼의 환경변수 설정)
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

`JWT_ACCESS_SECRET`을 교체하면 발급된 액세스 토큰이 전부 무효가 되어 재로그인이 필요하다.
소셜 로그인 리다이렉트 URI가 공급자 콘솔에 프로덕션 도메인으로 등록되어 있는지 확인한다.

---

## 5. 프론트엔드 배포 (Vercel)

Vercel과 GitHub 저장소가 연결되어 있으면 `main` 브랜치 push 시 자동 배포된다.

수동 배포가 필요한 경우:

```bash
npm install -g vercel
vercel --prod
```

Vercel 대시보드 → "Environment Variables"에서 다음이 설정되었는지 확인한다:
`API_URL`(서버 전용, NestJS 주소), `NEXT_PUBLIC_WS_URL`(월드 소켓), `NEXT_PUBLIC_MAPBOX_TOKEN`,
`NEXT_PUBLIC_LIVEKIT_URL`, `NEXT_PUBLIC_APP_URL`.

---

## 6. 배포 후 검증 체크리스트

- [ ] DB 마이그레이션 `0001`~`0010` 전부 적용됨 (psql로 스키마 확인)
- [ ] API 서버 헬스 정상 (`GET /api/health` → `{ "status": "ok" }`)
- [ ] socket.io 월드 게이트웨이 접속 및 `positions` 수신 정상
- [ ] Vercel 빌드 성공 (Vercel 대시보드 "Deployments")
- [ ] Mapbox 토큰 도메인 락 설정 (프로덕션 도메인만 허용)
- [ ] LiveKit API 키 유효성 확인 (음성 연결 테스트)
- [ ] 결제 웹훅 URL이 프로덕션 NestJS billing 엔드포인트로 등록됨 (PG사 대시보드)
- [ ] API가 `app_api` 롤로 접속하여 `orders` 등 RLS 정책이 적용됨을 확인

---

## 관련 문서

- [클라우드 인프라 초기 셋업](../../onboarding/infra-setup.md)
- [모니터링](../monitoring.md)
- [과금 방어 대응](./billing-guard.md)
- [개발 명령어](../../onboarding/commands.md)
