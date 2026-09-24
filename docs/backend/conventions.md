# 백엔드 개발 컨벤션

---

## API 설계 원칙

### 4대 하네스 (절대 불변 규칙)

PRD에 정의된 4대 영역별 순수 공간 광고 방어 하네스. 위반 시 즉시 PR 반려.

| 하네스 | 규칙 |
|---|---|
| **DB 하네스** | `sponsor_buildings` 테이블은 읽기 전용 Stateless 마스터 테이블. 유저 테이블과 FK 연결 금지. 파밍 횟수·보상 여부 컬럼 추가 금지 |
| **API 하네스** | 공간 연산·광고 노출 감지 API는 오직 `GET` 요청만 허용. 이동 행동이 DB 상태를 변경하는 `POST`/`PUT`/`DELETE` 엔드포인트 개설 금지 |
| **프론트엔드 하네스** | 3D 렌더링 캔버스 위에 `click`/`touchstart` 이벤트 리스너 바인딩 금지. 랜드마크 클릭 시 팝업 호출 금지 |
| **과금 하네스** | B2B 매출은 CPT(기간 고정제) 정가 판매만 허용. CPC/CPA 정산 엔진 도입 금지 |

---

## NestJS 모듈 구조 규칙

### 파일 구조

각 도메인은 `controller` / `service` / `module` 삼분할을 기본으로 한다. 입력은 DTO + `class-validator`로 검증한다(`main.ts`의 전역 `ValidationPipe`, `whitelist: true`).

```
apps/api/src/[domain]/
├── [domain].controller.ts   ← 라우팅 + 요청/응답 (DTO로 검증)
├── [domain].service.ts      ← 핵심 비즈니스 로직
├── [domain].module.ts       ← 의존성 조립
└── dto/                     ← 요청 DTO (class-validator 데코레이터)
```

### 인증 가드

- 전역 기본 가드는 `AccessTokenGuard`(`APP_GUARD`). 액세스 토큰 서명만 검증하고 DB는 조회하지 않는다. 인증 없이 열어야 하는 엔드포인트(회원가입·로그인·리프레시·OAuth·상품 조회·PG 웹훅·헬스)만 `@Public()` 데코레이터로 명시 해제한다.
- 가드가 검증한 `user_id` / `role`을 요청 스코프에 실어 서비스·리포지토리로 전달한다.

### RLS 컨텍스트 트랜잭션

- 유저 요청은 `DatabaseService.withUser({ userId, role }, fn)`로 감싼다. 트랜잭션 안에서 `set_config('app.user_id', ..., true)` / `set_config('app.user_role', ..., true)`로 컨텍스트를 넣고 RLS 정책이 이를 읽는다. **반드시 트랜잭션 범위**여야 하며 전역 `SET` 금지(커넥션 풀에 컨텍스트 잔존 시 유출).
- 서버 전용 작업과 인증 흐름만 `withAdmin`(admin 컨텍스트)로 RLS를 우회한다 — 결제 웹훅·발급 워커, 그리고 가입·로그인·리프레시·OAuth·로그아웃에서 `users.service`가 사용자 행을 조회·생성·갱신할 때다. 그 밖의 인증된 유저 요청은 `withUser`를 쓴다.

### 에러 처리

결제는 **웹훅이 주문 상태만 `PAID`로 바꾸고**, 실제 지급(아바타 발급·가시거리 상향)은 발급 워커(`fulfillment.worker`)가 따로 처리한다. UNIQUE 위반(`23505`)은 "이미 처리됨"으로 흡수하고, 그 밖의 오류는 로그를 남기고 전파한다.

```typescript
// billing.service.ts — 결제 승인 반영. 같은 승인번호가 이미 반영됐으면 흡수한다
try {
  await client.query(
    `UPDATE orders SET status = 'PAID', pg_approval_number = $2, completed_at = now() WHERE id = $1`,
    [orderId, approvalNumber],
  )
} catch (error) {
  if ((error as { code?: string }).code === '23505') return { applied: false }
  throw error
}
```

| 상황 | 처리 |
|---|---|
| 웹훅 서명 불일치 | `401` — `x-pg-signature`(raw body의 HMAC-SHA256 hex) 검증 실패 |
| 필수 필드 누락·없는 주문·결제 금액 불일치 | `400`. 주문 상태는 바꾸지 않는다(금액 불일치는 에러 로그를 남긴다) |
| 이미 `PAID`인 주문·승인번호 재사용 | `applied: false`로 흡수 (승인번호 재사용은 경고 로그) |
| 지급 한 건 실패 | 워커가 로그만 남기고 다음 주문을 계속 처리한다. 해당 주문은 다음 tick에 다시 집는다 |
| 아바타 외형 충돌 | `fulfill_attempts`를 올리고 외형을 다시 뽑는다. 8회에 도달한 주문은 워커 대상에서 빠져 `PAID`·미지급으로 남으며 수동 처리한다 |
| 지급 방법이 없는 상품 | 에러 로그를 남기고 주문을 대기 상태로 둔다 |

주문 상태 `FAILED`·`REFUNDED`는 스키마(`order_status`)에 있으나 코드가 전이시키지 않는다. PG사 결제 취소 호출은 구현되어 있지 않다.

### 멱등성 보장

멱등성은 애플리케이션 조회가 아니라 **DB 제약(UNIQUE)**으로 보장한다. 같은 주문의 웹훅 재수신은 주문 행을 `FOR UPDATE`로 잠근 뒤 `status === 'PAID'` 검사로 걸러지고, 같은 승인번호가 다른 주문에 쓰이면 `orders_pg_approval_uniq`가 막는다. 발급은 `characters_order_item_uniq`(`order_id, order_seq`)가 순번 중복 INSERT를 차단하며, 위반은 정상 흐름(이미 처리됨)으로 흡수한다. 워커는 `FOR UPDATE SKIP LOCKED`로 대기 주문을 집지만 잠금은 조회 트랜잭션이 끝나면 풀리므로, 여러 인스턴스가 같은 주문을 다시 집을 수 있다. 그 중복은 위 UNIQUE 제약과 라이선스 `GREATEST` 갱신으로 흡수한다.

---

## 공간 쿼리 규칙

- 반경 탐지는 반드시 `ST_DWithin`을 사용하며 `geom::geography` 캐스팅 필수 (미터 단위)
- 거리 정렬은 `ST_Distance` 사용, `ORDER BY ST_Distance` + `LIMIT` 조합으로 풀스캔 방지
- `geom` 컬럼에 GiST 인덱스 없이 `ST_DWithin` 쿼리 실행 금지
- 스폰서 반경 조회는 마이그레이션 `0005`의 `nearby_sponsor_buildings(p_lng, p_lat, p_radius_m = 500)` 함수가 이 규칙대로 구현한다. API에는 아직 공간 쿼리 엔드포인트가 없다(스폰서 기능은 Phase 5)

```sql
-- 올바른 예
SELECT id FROM sponsor_buildings
WHERE ST_DWithin(geom::geography, ST_MakePoint($lon, $lat)::geography, $r)
ORDER BY ST_Distance(geom::geography, ST_MakePoint($lon, $lat)::geography);

-- 금지 예 (인덱스 미사용, 풀스캔)
SELECT id FROM sponsor_buildings
WHERE ST_Distance(geom, ST_MakePoint($lon, $lat)) < $r;
```

---

## socket.io 게이트웨이 규칙

게이트웨이는 대시보드 월드 전용이다(루트 3D 씬은 서버에 연결하지 않는다).

- 위치 좌표와 채팅 메시지는 NestJS WebSocket 게이트웨이(`apps/api/src/world/world.gateway.ts`, 네임스페이스 `/world`)를 통해서만 브로드캐스트
- 접속 시 핸드셰이크 `auth.token`의 액세스 토큰을 검증하고, 없거나 무효면 즉시 끊는다
- 소켓 이벤트 이름·페이로드는 `shared/world/contract.ts`에 정의하고, 게이트웨이의 `Server`/`Socket`을 이 계약 제네릭으로 타입한다(프론트·백엔드 중 한쪽만 바뀌면 컴파일 단계에서 잡힘)
- 좌표는 위경도다. `move`마다 서버가 직전 좌표 대비 30km/h 초과 이동을 버리고(`isPlausibleMove`), 500m 섹터와 경계 50m 이내 인접 섹터를 계산해 방을 옮긴다. 섹터 계산은 `shared/world/sector.ts`(프론트·백엔드 단일 소스, 위도별 경도 폭)를 따른다
- 서버가 200ms(5Hz)마다 섹터별 위치를 한 묶음(`positions`)으로 방송한다. 2명 이상인 섹터만 보내고, 30초 동안 `move`가 없는 유저의 위치 상태는 메모리에서 지운다(소켓 연결·룸 참여는 유지)
- 채팅은 묶지 않고 즉시 섹터 방에 흘린다(본문 200자, 닉네임 32자로 자름)
- 위치·채팅 메시지는 DB에 영구 저장 금지 (무상태 휘발성 브로드캐스트)
- 섹터 이탈 시 구 섹터 룸 즉시 leave (연결 수 관리)
- 대시보드 월드가 언마운트되면 클라이언트가 소켓을 닫는다

---

## 코드 컨벤션

- TypeScript strict mode 사용, `any` 타입 금지
- Node.js/NestJS 런타임 기준으로 작성
- 환경변수는 NestJS `ConfigService`로 주입해 사용(`ConfigModule` 전역, `.env.local` → `.env` 순). DI 밖인 `main.ts` 부트스트랩과 게이트웨이 데코레이터 인자(`PORT`, `WEB_ORIGIN`)만 `process.env`를 읽는다. 게이트웨이 데코레이터(소켓 CORS `WEB_ORIGIN`)는 모듈 import 시점, 즉 `ConfigModule`이 `.env.local`을 읽기 전에 평가되므로 `.env.local`의 값을 쓰지 못한다. 소켓 CORS 오리진은 프로세스 환경변수로 넣는다(HTTP CORS를 설정하는 `main.ts`는 모듈 생성 뒤에 읽으므로 `.env.local` 값을 쓴다)
- 모든 DB 접근은 `pg` 파라미터 바인딩(`$1`, `$2` …)으로 수행, SQL 문자열 조합 금지 (SQL Injection 방어)

---

## 관련 문서

- [보안 규격](./security/encryption.md)
- [ADR 002 — 자체 백엔드(NestJS + 공유 Postgres)](../adr/002-self-hosted-backend.md)
- [아키텍처 개요 — API 원칙](../architecture/overview.md)
