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

각 도메인은 `controller` / `service` / `module` 삼분할을 기본으로 한다. 입력은 DTO + `class-validator`로 검증한다.

```
apps/api/src/[domain]/
├── [domain].controller.ts   ← 라우팅 + 요청/응답 (DTO로 검증)
├── [domain].service.ts      ← 핵심 비즈니스 로직
├── [domain].module.ts       ← 의존성 조립
└── dto/                     ← 요청 DTO (class-validator 데코레이터)
```

### 인증 가드

- 전역 기본 가드는 `AccessTokenGuard`. 인증 없이 열어야 하는 엔드포인트만 `@Public()` 데코레이터로 명시 해제한다.
- 가드가 검증한 `user_id` / `role`을 요청 스코프에 실어 서비스·리포지토리로 전달한다.

### RLS 컨텍스트 트랜잭션

- 유저 요청은 `DatabaseService.withUser(userId, role, fn)`로 감싼다. 트랜잭션 안에서 `set_config('app.user_id', ..., true)` / `set_config('app.user_role', ..., true)`로 컨텍스트를 넣고 RLS 정책이 이를 읽는다. **반드시 트랜잭션 범위**여야 하며 전역 `SET` 금지(커넥션 풀에 컨텍스트 잔존 시 유출).
- 서버 전용 작업(결제 웹훅·발급 워커)만 `withAdmin`(admin 컨텍스트)로 RLS를 우회한다. 유저 경로에서 `withAdmin` 사용 금지.

### 에러 처리

```typescript
// 결제 웹훅 예시 — 실패 시 자동 롤백
try {
  await this.db.withAdmin(async (tx) => {
    await tx.query('INSERT INTO characters (...) VALUES (...)');
  });
} catch (err) {
  await this.db.withAdmin((tx) =>
    tx.query('UPDATE orders SET status = $1, fail_reason = $2 WHERE id = $3',
      ['FAILED', err.message, orderId]),
  );
  await this.pg.cancel(pgApprovalNumber); // PG사 자동 취소
  throw new InternalServerErrorException('ROLLBACK_OK');
}
```

### 멱등성 보장

멱등성은 애플리케이션 조회가 아니라 **DB 제약(UNIQUE)**으로 보장한다. 웹훅이 중복 수신되어도 `orders_pg_approval_uniq`(주문 승인번호) / `characters_order_item_uniq`(묶음 상품 발급) 제약이 중복 INSERT를 물리적으로 차단하며, 위반은 정상 흐름으로 흡수(이미 처리됨)한다.

---

## 공간 쿼리 규칙

- 반경 탐지는 반드시 `ST_DWithin`을 사용하며 `geom::geography` 캐스팅 필수 (미터 단위)
- 거리 정렬은 `ST_Distance` 사용, `ORDER BY ST_Distance` + `LIMIT` 조합으로 풀스캔 방지
- `geom` 컬럼에 GiST 인덱스 없이 `ST_DWithin` 쿼리 실행 금지

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

- 위치 좌표와 채팅 메시지는 NestJS WebSocket 게이트웨이(`apps/api/src/world/world.gateway.ts`)를 통해서만 브로드캐스트
- 서버가 섹터 단위로 위치를 묶어 5Hz로 방송한다. 섹터 판정·속도 검증도 서버에서 수행(`world/sector.ts`)
- 위치·채팅 메시지는 DB에 영구 저장 금지 (무상태 휘발성 브로드캐스트)
- 섹터 이탈 시 구 섹터 룸 즉시 leave (연결 수 관리)
- 유저가 로그아웃하거나 창을 닫을 때 클라이언트가 소켓 disconnect 처리

---

## 코드 컨벤션

- TypeScript strict mode 사용, `any` 타입 금지
- Node.js/NestJS 런타임 기준으로 작성
- 환경변수는 NestJS `ConfigService`로 주입해 사용
- 모든 DB 접근은 `pg` 파라미터 바인딩(`$1`, `$2` …)으로 수행, SQL 문자열 조합 금지 (SQL Injection 방어)

---

## 관련 문서

- [보안 규격](./security/encryption.md)
- [ADR 002 — 자체 백엔드(NestJS + 공유 Postgres)](../adr/002-self-hosted-backend.md)
- [아키텍처 개요 — API 원칙](../architecture/overview.md)
