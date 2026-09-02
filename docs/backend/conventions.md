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

## Edge Functions 작성 규칙

### 파일 구조

```
supabase/functions/[function-name]/
├── index.ts        ← 진입점 (요청 파싱 + 응답 반환)
├── handler.ts      ← 핵심 비즈니스 로직
└── types.ts        ← 입출력 타입 정의
```

### 에러 처리

```typescript
// 결제 웹훅 예시 — 실패 시 자동 롤백
try {
  await db.characters.insert({ ... });
} catch (err) {
  await db.orders.update({ id: orderId, status: 'FAILED', fail_reason: err.message });
  await pgClient.cancel(pgApprovalNumber); // PG사 자동 취소
  await db.cs_logs.insert({ user_id, order_id, error: err.message }); // CS 로그
  return new Response(JSON.stringify({ error: 'ROLLBACK_OK' }), { status: 500 });
}
```

### 멱등성 보장

```typescript
// 웹훅 중복 수신 방어
const existing = await db.orders.findOne({ id: orderId, status: 'PAID' });
if (existing) {
  return new Response(JSON.stringify({ ok: true, idempotent: true }), { status: 200 });
}
```

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

## 실시간 소켓 규칙 (Supabase Realtime)

- 위치 좌표와 채팅 메시지는 Realtime 채널을 통해서만 브로드캐스트
- 채팅 메시지는 DB에 영구 저장 금지 (무상태 휘발성 라우팅)
- 섹터 이탈 시 구 섹터 채널 즉시 구독 해제 (연결 수 관리)
- 유저가 로그아웃하거나 창을 닫을 때 `channel.unsubscribe()` 반드시 호출

---

## 코드 컨벤션

- TypeScript strict mode 사용, `any` 타입 금지
- Supabase Edge Function은 Deno 런타임 기준 작성 (Node.js API 일부 미지원)
- 환경변수는 `Deno.env.get('VAR_NAME')` 사용 (Edge Functions 내)
- 모든 DB 접근은 Supabase 클라이언트를 통해 수행, 직접 SQL 문자열 조합 금지 (SQL Injection 방어)

---

## 관련 문서

- [보안 규격](./security/encryption.md)
- [ADR 002 — Supabase 통합](../adr/002-supabase-all-in-one.md)
- [아키텍처 개요 — API 원칙](../architecture/overview.md)
