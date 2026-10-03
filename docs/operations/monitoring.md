# 모니터링

---

## 비용 알림 설정

### 지도 타일 (OpenFreeMap · AWS Terrain Tiles)

지도 타일은 키·과금이 없어 비용 알림을 둘 곳이 없다. 대신 가용성을 본다 — OpenFreeMap은 SLA가 없는 무료 공개 서버라, 멈추면 내 주변 바닥과 펼침 지도가 비어 보인다.

| 사용처 | 받는 때 | 요청 특성 |
|---|---|---|
| 플레이 씬 펼침 지도 | 지도를 처음 펼칠 때(펼치지 않으면 받지 않는다) | OpenFreeMap TileJSON·글꼴·벡터 타일과 지형 타일. 펼칠 때와 첫 위치가 올 때 '나'(GPS 위치)에게 맞추고, 펼친 동안 끌기·확대/축소(줌 11~18.5)로 둘러본 만큼 요청한다. 그 밖의 GPS 갱신은 마커만 옮긴다 |
| 내 주변 바닥·펼침 지도 | 바닥은 씬을 열 때부터 걷는 만큼(z14 타일), 펼침 지도는 처음 펼칠 때 | 펼침 지도는 플레이 씬과 같은 타일·줌 범위이고, 걷는 동안은 마커만 옮긴다 |
| 맵 베이스맵 (예정) | `/map` 진입부터 | 유저가 줌 14~20을 조작하고, 캐릭터 이동(PC 키보드·모바일 GPS)을 따라 중심이 옮겨 간다 |

타일 주소는 `components/map/paper-map-style.ts`(펼침 지도)와 `lib/geo/vector-tiles.ts`(내 주변 바닥)에만 있다. OpenFreeMap이 멈추거나 사용량을 막으면 자체 타일(Protomaps PMTiles + Cloudflare R2, [로드맵 P5-2](../roadmap.md))로 주소를 바꾼다.

### 자체 PostgreSQL + API 서버 + 실시간 서버

호스팅은 정액 요금제에 묶이지 않으므로, 벤더 청구서 대신 **자원 사용량 지표**를 직접
관측해 임계치에서 대응한다. DB와 API 서버는 하나의 공유 인스턴스를 바라보므로 두 계층을
함께 본다. 소켓 지표는 DB를 쓰지 않는 실시간 서버(`apps/realtime`)의 것이다.

| 지표 | 확인 방법 | 임계치 | 조치 |
|---|---|---|---|
| DB 스토리지 | `pg_database_size()` | 프로비저닝 용량의 80% | 오래된 `ad_impressions` 파티셔닝·아카이빙 검토 |
| 커넥션 풀 사용률 | `pg_stat_activity` vs `DB_POOL_MAX` | 활성 커넥션이 풀 상한의 80% | `DB_POOL_MAX` 상향, 누수 쿼리 추적. API 서버는 상태가 없어 수평 확장할 수 있다(인스턴스 수 × `DB_POOL_MAX`가 DB 최대 커넥션 안에 들게 잡는다) |
| socket.io 동시 연결 | 실시간 서버 섹터 게이트웨이(`/sector`) 접속 소켓 수 — 맵 접속자만 해당(화면을 붙이면 생긴다) | 인스턴스당 500 concurrent | 섹터 이탈 채널 해제 로직 점검, 실시간 서버 단일 인스턴스 수직 확장 (스케일아웃은 socket.io 어댑터·위치 상태 공유 구현 뒤 — [비용 방어 런북](./runbook/billing-guard.md)) |
| 플레이 씬 소켓 연결 | 실시간 서버 방 게이트웨이(`/room`) 접속 수(`RoomGateway.playerCount`) — 로그인 없는 공개 방문자 | 전체 정원 1,000의 80% | 방 정원(20)·전체 정원 조정, 실시간 서버 단일 인스턴스 수직 확장 (인스턴스끼리 방 상태를 공유하지 않는다) |
| 내 주변 소켓 연결 | 실시간 서버 근접 게이트웨이(`/proximity`) 접속 수(`ProximityGateway.playerCount`) — 로그인 없는 공개 방문자 | 전체 정원 1,000의 80% | 한 곳에 몰리면 틱마다 고르는 계산이 늘어난다(250m 격자 3×3칸). 전체 정원 조정, 실시간 서버 단일 인스턴스 수직 확장 |
| 활성 섹터 채널 수 | 실시간 서버 섹터 게이트웨이가 방송 중인 섹터(room) 수 (500m 위경도 격자) | 급증 패턴 | 유령 채널(빈 섹터) 잔존 여부 확인 |

DB 스토리지 확인 쿼리:

```sql
-- 공유 DB 전체 용량
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;

-- 상위 테이블 용량 (증가 주범 식별)
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
```

커넥션 풀 압박 확인 쿼리:

```sql
-- app_api 롤의 활성/유휴 커넥션 분포 (DB_POOL_MAX와 대조)
SELECT state, count(*)
FROM pg_stat_activity
WHERE usename = 'app_api'
GROUP BY state;
```

---

## 헬스체크

| 항목 | 확인 방법 | 주기 |
|---|---|---|
| API 서버 헬스 | API 서버 `GET /health` → `{ "status": "ok" }` (NestJS `health.controller`, 인증 불필요) | 1분 간격 프로브 |
| 실시간 서버 헬스 | 실시간 서버 `GET /health` → `{ "status": "ok" }` (인증 불필요, DB와 무관) | 1분 간격 프로브 |
| 프론트 서버 헬스 | 웹 `GET /api/health` → `{ "status": "ok" }` (Next Route Handler 자체 응답, API·실시간 서버를 호출하지 않음) | 1분 간격 프로브 |
| DB 응답 | API 서버에서 `SELECT 1` 왕복 시간 | 일 1회 |
| socket.io 섹터 게이트웨이 | 실시간 서버 `/sector` 네임스페이스 접속·`positions` 수신 확인(API 서버가 발급한 액세스 토큰으로). `positions`는 한 섹터에 2명 이상일 때만 방송되므로 같은 섹터에 두 클라이언트를 붙여 본다 | 이상 시 즉시 |
| socket.io 방 게이트웨이 | 실시간 서버 `/room` 네임스페이스에 토큰 없이 두 클라이언트를 붙여 `welcome` 수신과, 한쪽이 보낸 `state`가 35ms 틱 안에 다른 쪽 `states`로 오는지 확인 | 이상 시 즉시 |
| socket.io 근접 게이트웨이 | 실시간 서버 `/proximity`에 두 클라이언트를 붙여 서로 200m 안의 실제 좌표를 보낸 뒤 다음 틱에 상대의 전체 상태가 `states`로 오는지 확인 | 이상 시 즉시 |
| API 서버 에러율 | API 서버 로그의 5xx 비율 | 이상 시 즉시 |
| 지도 타일 | OpenFreeMap TileJSON(`https://tiles.openfreemap.org/planet`)이 200으로 오고 펼침 지도·내 주변 바닥이 그려지는지 | 주 1회 |
| Vercel 빌드 상태 | Vercel 대시보드 → "Deployments" | 배포 시마다 |

API 서버의 무중단 배포·컨테이너 오케스트레이터 liveness/readiness 프로브 대상은 API 서버
`GET /health`이고, 실시간 서버는 실시간 서버 `GET /health`다. 웹의 `/api/health`는 Next 서버가 살아 있는지만 알려 주므로
두 서버의 상태 판단에 쓰지 않는다.

---

## 에러 모니터링

### API 서버 에러율

API 서버 로그에서 5xx 응답과 처리되지 않은 예외를 관측한다. 인증 실패(401/403)는 정상
트래픽에 섞여 있으므로 급증 여부만 본다. 결제 웹훅(`billing`)과 발급 워커
(`fulfillment.worker`)의 에러는 매출과 직결되므로 별도 알림 대상으로 둔다.

주요 관측 포인트:
- 웹훅 서명 검증 실패(잘못된 `PG_WEBHOOK_SECRET` 또는 위조 요청) — `401`
- 결제 금액 불일치·이미 사용된 승인번호 로그
- 발급 워커 재시도 누적(아바타 외형 충돌 시 `orders.fulfill_attempts` 증가)
- 지급 방법이 없는 상품 로그("지급 방법이 없는 상품")
- DB 커넥션 획득 타임아웃(풀 고갈)

### 지급 정체 감지

웹훅은 주문을 `PAID`로만 바꾸고 지급은 발급 워커가 처리한다. 코드가 주문을 `FAILED`로 전이시키지
않으므로, 결제 이상은 **결제됐는데 지급되지 않은 주문**으로 찾는다. 외형 충돌이 8회에 도달한
주문(`fulfill_attempts >= 8`)은 워커 대상에서 빠지므로 수동 처리가 필요하다.

```sql
-- 결제 후 10분이 지나도록 지급되지 않은 주문
SELECT id, user_id, product_type, amount_krw, fulfill_attempts, completed_at
FROM orders
WHERE status = 'PAID'
  AND fulfilled_at IS NULL
  AND (fulfill_attempts >= 8 OR completed_at < now() - interval '10 minutes')
ORDER BY completed_at;
```

### 광고 노출 이상 감지

스폰서 노출 기록(`ad_impressions`)은 Phase 4 스폰서 기능과 함께 쌓이기 시작한다. 그 뒤 광고주별
일일 노출을 이 쿼리로 본다.

```sql
-- 광고주별 일일 노출 수 집계 (예상치 대비 이상 저조 시 렌더링 로직 점검)
SELECT b.id, b.advertiser_id, COUNT(i.id) AS impressions_today
FROM sponsor_buildings b
LEFT JOIN ad_impressions i ON i.building_id = b.id
  AND i.impressed_at::date = CURRENT_DATE
WHERE b.is_active = true
GROUP BY b.id, b.advertiser_id
ORDER BY impressions_today;
```

---

## 관련 문서

- [과금 방어 대응](./runbook/billing-guard.md)
- [배포 절차](./runbook/deploy.md)
- [API 키 설정](../onboarding/api-keys.md)
